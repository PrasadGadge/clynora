"""
ClinBridge — SQLite Database & Entity Persistence Layer

Provides tables for:
- referrals (AI-assisted clinical referrals)
- clinics (Clinics in Pune, Maharashtra)
- doctors (Specialists linked to clinics)
- patients (Patient records)
- appointments (Clinical appointments)

Auto-seeds default Pune, Maharashtra healthcare facilities and specialists
on initial startup if tables are empty.
"""

import json
import sqlite3
import os
import time
from contextlib import contextmanager
from typing import List, Optional, Dict, Any
from app.schemas.referral import ReferralRecord
from app.schemas.entities import Clinic, Doctor, Patient, Appointment
from app.auth import hash_password, ROLES

def _db_path() -> str:
    """
    Resolves DATABASE_URL at CALL time, not import time. This matters for
    tests: a module-level `DB_PATH = os.getenv(...)` constant would be
    frozen the first time `app.db` is imported by *any* test in the
    process, so a later test setting `os.environ["DATABASE_URL"]` to its
    own isolated temp file would silently have no effect -- the only way
    around that used to be deleting `app.*` from `sys.modules` and
    re-importing everything, which risks separate Pydantic model class
    identities across tests (a `ReferralRecord` built by test A and one
    imported fresh by test B are technically different classes, which can
    surface as confusing `ValidationError: Input should be a valid ...
    instance` failures). Resolving lazily here means tests just set the
    env var per-test/fixture and get proper isolation with zero module
    reloading required.
    """
    return os.getenv("DATABASE_URL", "sqlite:///./clinbridge.db").replace("sqlite:///", "")


@contextmanager
def get_connection():
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Creates tables and seeds default Pune sample data if empty."""
    with get_connection() as conn:
        # Referrals table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS referrals (
                referral_id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Clinics table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS clinics (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                locality TEXT NOT NULL,
                city TEXT DEFAULT 'Pune',
                state TEXT DEFAULT 'Maharashtra',
                pincode TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL,
                specialities TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Doctors table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS doctors (
                id TEXT PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                name TEXT NOT NULL,
                specialization TEXT NOT NULL,
                qualification TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL,
                availability TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE
            )
        """)

        # Patients table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS patients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                age INTEGER NOT NULL,
                sex TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT,
                address TEXT NOT NULL,
                medical_history TEXT,
                allergies TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Appointments table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                clinic_id TEXT NOT NULL,
                doctor_id TEXT NOT NULL,
                patient_name TEXT NOT NULL,
                patient_phone TEXT NOT NULL,
                patient_age INTEGER,
                patient_sex TEXT,
                appointment_date TEXT NOT NULL,
                appointment_time TEXT NOT NULL,
                reason TEXT NOT NULL,
                status TEXT DEFAULT 'scheduled',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (clinic_id) REFERENCES clinics (id) ON DELETE CASCADE,
                FOREIGN KEY (doctor_id) REFERENCES doctors (id) ON DELETE CASCADE
            )
        """)

        # Users table (authentication + RBAC)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL,
                full_name TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Referral audit trail — one immutable row per meaningful action.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS referral_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referral_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                actor_username TEXT,
                actor_role TEXT,
                old_status TEXT,
                new_status TEXT,
                change_summary TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referral_id) REFERENCES referrals (referral_id) ON DELETE CASCADE
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_referral_events_referral_id ON referral_events(referral_id)")

        # Referral version history — a full snapshot per edit, never overwritten.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS referral_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                referral_id TEXT NOT NULL,
                version_number INTEGER NOT NULL,
                data TEXT NOT NULL,
                actor_username TEXT,
                change_summary TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (referral_id) REFERENCES referrals (referral_id) ON DELETE CASCADE,
                UNIQUE(referral_id, version_number)
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_referral_versions_referral_id ON referral_versions(referral_id)")

        # Seed initial Pune clinics and doctors if table is empty
        clinic_count = conn.execute("SELECT COUNT(*) as count FROM clinics").fetchone()["count"]
        if clinic_count == 0:
            seed_pune_data(conn)

        # Seed demo accounts (one per role) if the users table is empty. Passwords are
        # documented in README/.env.example — never printed to logs — and are meant to
        # be rotated before any non-local deployment.
        user_count = conn.execute("SELECT COUNT(*) as count FROM users").fetchone()["count"]
        if user_count == 0:
            seed_demo_users(conn)


def seed_pune_data(conn: sqlite3.Connection):
    """Seeds clinics, doctors, patients, and initial appointments in Pune, Maharashtra."""
    clinics_data = [
        ("CLN-PUN-01", "Kothrud Care Speciality Clinic", "Plot 42, Paud Road, Near Vanaz Metro Station, Kothrud, Pune, Maharashtra 411038", "Kothrud", "Pune", "Maharashtra", "411038", "+91 20 2544 1234", "kothrud.care@clinics.in", json.dumps(["Cardiology", "Internal Medicine", "General Medicine"])),
        ("CLN-PUN-02", "Baner Multi-Speciality Health Center", "S.No 84/1, Baner-Pashan Link Road, Baner, Pune, Maharashtra 411045", "Baner", "Pune", "Maharashtra", "411045", "+91 20 2729 5678", "contact@banerhealth.in", json.dumps(["Cardiology", "Orthopedics", "Pulmonology"])),
        ("CLN-PUN-03", "Hinjewadi Tech-City Medicare", "Phase 1, Near Infosys Circle, Hinjewadi IT Park, Pune, Maharashtra 411057", "Hinjewadi", "Pune", "Maharashtra", "411057", "+91 20 6699 4321", "hinjewadi.medicare@clinics.in", json.dumps(["Internal Medicine", "Endocrinology", "General Surgery"])),
        ("CLN-PUN-04", "Viman Nagar Medical Center", "Symbiosis Road, Near Phoenix Mall, Viman Nagar, Pune, Maharashtra 411014", "Viman Nagar", "Pune", "Maharashtra", "411014", "+91 20 4123 7890", "care@vimannagar-med.in", json.dumps(["Pulmonology", "General Medicine", "Cardiology"])),
        ("CLN-PUN-05", "Shivajinagar Heart & Multi-Care Hospital", "FC Road, Deccan Gymkhana, Shivajinagar, Pune, Maharashtra 411005", "Shivajinagar", "Pune", "Maharashtra", "411005", "+91 20 2553 9000", "info@shivajinagarheart.in", json.dumps(["Cardiology", "General Surgery", "Internal Medicine"])),
        ("CLN-PUN-06", "Kalyani Nagar Wellness & Endocrine Clinic", "East Avenue, Near Jogger's Park, Kalyani Nagar, Pune, Maharashtra 411006", "Kalyani Nagar", "Pune", "Maharashtra", "411006", "+91 20 2665 1122", "wellness@kalyaninagar.in", json.dumps(["Endocrinology", "Diabetology", "Internal Medicine"])),
    ]

    conn.executemany("""
        INSERT INTO clinics (id, name, address, locality, city, state, pincode, phone, email, specialities)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, clinics_data)

    doctors_data = [
        ("DOC-PUN-01", "CLN-PUN-01", "Dr. Aarti Deshmukh", "Cardiology", "MBBS, MD (Medicine), DM (Cardiology) — Gold Medalist, BJ Medical College", "+91 98220 11234", "dr.aarti.deshmukh@kothrudcare.in", "Mon-Fri 09:00 - 13:00"),
        ("DOC-PUN-02", "CLN-PUN-01", "Dr. Rajesh Kulkarni", "Internal Medicine", "MBBS, MD (Internal Medicine), FACP", "+91 98220 22345", "dr.rajesh.kulkarni@kothrudcare.in", "Mon-Sat 10:00 - 16:00"),
        ("DOC-PUN-03", "CLN-PUN-02", "Dr. Vikram Joshi", "Orthopedics", "MBBS, MS (Orthopedics), M.Ch (Joint Replacement)", "+91 98220 33456", "dr.vikram.joshi@banerhealth.in", "Tue-Sat 11:00 - 18:00"),
        ("DOC-PUN-04", "CLN-PUN-02", "Dr. Sunita Patil", "Cardiology", "MBBS, MD, DNB (Cardiology)", "+91 98220 44567", "dr.sunita.patil@banerhealth.in", "Mon-Fri 14:00 - 19:00"),
        ("DOC-PUN-05", "CLN-PUN-03", "Dr. Amit Shinde", "Endocrinology", "MBBS, MD, DM (Endocrinology & Diabetology)", "+91 98220 55678", "dr.amit.shinde@hinjewadi.in", "Mon-Fri 09:30 - 15:30"),
        ("DOC-PUN-06", "CLN-PUN-03", "Dr. Meera Gokhale", "General Surgery", "MBBS, MS (General & Laparoscopic Surgery)", "+91 98220 66789", "dr.meera.gokhale@hinjewadi.in", "Mon-Sat 11:00 - 17:00"),
        ("DOC-PUN-07", "CLN-PUN-04", "Dr. Anand Kute", "Pulmonology", "MBBS, MD (Chest & Pulmonary Medicine)", "+91 98220 77890", "dr.anand.kute@vimannagar.in", "Mon-Sat 10:00 - 16:00"),
        ("DOC-PUN-08", "CLN-PUN-05", "Dr. Vivek Rao", "Cardiology", "MBBS, MD, DM (Interventional Cardiology)", "+91 98220 88901", "dr.vivek.rao@shivajinagarheart.in", "Mon-Fri 08:30 - 14:00"),
        ("DOC-PUN-09", "CLN-PUN-06", "Dr. Neha Bapat", "Endocrinology", "MBBS, MD, DNB (Endocrinology)", "+91 98220 99012", "dr.neha.bapat@kalyaninagar.in", "Mon-Fri 10:00 - 16:00"),
    ]

    conn.executemany("""
        INSERT INTO doctors (id, clinic_id, name, specialization, qualification, phone, email, availability)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, doctors_data)

    patients_data = [
        ("PAT-PUN-01", "Suresh Tendulkar", 67, "male", "+91 98220 99887", "suresh.t@gmail.com", "Paud Road, Kothrud, Pune", "Hypertension (10 yrs)", "Penicillin"),
        ("PAT-PUN-02", "Anjali Kulkarni", 54, "female", "+91 98220 88776", "anjali.k@yahoo.com", "Phase 1, Hinjewadi, Pune", "Type 2 Diabetes", "None documented"),
        ("PAT-PUN-03", "Prakash Deshpande", 45, "male", "+91 98220 77665", "prakash.d@outlook.com", "Deccan Gymkhana, Pune", "Asthma, GERD", "Sulfa drugs"),
    ]

    conn.executemany("""
        INSERT INTO patients (id, name, age, sex, phone, email, address, medical_history, allergies)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, patients_data)

    appointments_data = [
        ("APT-PUN-01", "CLN-PUN-01", "DOC-PUN-01", "Suresh Tendulkar", "+91 98220 99887", 67, "male", "2026-09-05", "10:30 AM", "Cardiac Evaluation - Chest Pain Followup", "scheduled"),
        ("APT-PUN-02", "CLN-PUN-03", "DOC-PUN-05", "Anjali Kulkarni", "+91 98220 88776", 54, "female", "2026-09-06", "11:00 AM", "Endocrine Consultation - Glycemic Control", "scheduled"),
    ]

    conn.executemany("""
        INSERT INTO appointments (id, clinic_id, doctor_id, patient_name, patient_phone, patient_age, patient_sex, appointment_date, appointment_time, reason, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, appointments_data)


def seed_demo_users(conn: sqlite3.Connection):
    """
    Seeds one demo account per role for the SIH demo/local dev. These are
    NOT production credentials — DEMO_PASSWORD is read from the environment
    (falls back to a fixed, clearly-labelled demo password used only when
    CLINBRIDGE_DEMO_PASSWORD is unset) so a deployer can override it via
    .env without touching code.
    """
    demo_password = os.getenv("CLINBRIDGE_DEMO_PASSWORD", "ClinBridgeDemo#2026")
    demo_accounts = [
        ("admin", "admin", "Admin User"),
        ("dr.deshmukh", "referring_clinician", "Dr. Aarti Deshmukh"),
        ("dr.rao", "receiving_clinician", "Dr. Vivek Rao"),
        ("coordinator1", "coordinator", "Priya Coordinator"),
    ]
    rows = [
        (username, hash_password(demo_password), role, full_name)
        for username, role, full_name in demo_accounts
    ]
    conn.executemany(
        "INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)",
        rows,
    )


# ===== User / Auth Operations =====

def get_user(username: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row) if row else None


def create_user(username: str, password_hash: str, role: str, full_name: str) -> Dict[str, Any]:
    if role not in ROLES:
        raise ValueError(f"Invalid role '{role}'. Must be one of {ROLES}")
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO users (username, password_hash, role, full_name) VALUES (?, ?, ?, ?)",
            (username, password_hash, role, full_name),
        )
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(row)


# ===== Referral Audit Trail =====

def record_referral_event(
    referral_id: str,
    event_type: str,
    actor_username: Optional[str] = None,
    actor_role: Optional[str] = None,
    old_status: Optional[str] = None,
    new_status: Optional[str] = None,
    change_summary: Optional[str] = None,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO referral_events
                (referral_id, event_type, actor_username, actor_role, old_status, new_status, change_summary)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (referral_id, event_type, actor_username, actor_role, old_status, new_status, change_summary),
        )


def list_referral_events(referral_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM referral_events WHERE referral_id = ? ORDER BY id ASC",
            (referral_id,),
        ).fetchall()
        return [dict(r) for r in rows]


# ===== Referral Version History =====

def save_referral_version(
    referral_id: str,
    record: ReferralRecord,
    actor_username: Optional[str] = None,
    change_summary: Optional[str] = None,
) -> int:
    """Snapshots the current record as a new immutable version. Returns the version number."""
    with get_connection() as conn:
        last = conn.execute(
            "SELECT MAX(version_number) as v FROM referral_versions WHERE referral_id = ?",
            (referral_id,),
        ).fetchone()["v"]
        next_version = (last or 0) + 1
        conn.execute(
            """
            INSERT INTO referral_versions (referral_id, version_number, data, actor_username, change_summary)
            VALUES (?, ?, ?, ?, ?)
            """,
            (referral_id, next_version, record.model_dump_json(), actor_username, change_summary),
        )
        return next_version


def list_referral_versions(referral_id: str) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, referral_id, version_number, actor_username, change_summary, created_at "
            "FROM referral_versions WHERE referral_id = ? ORDER BY version_number ASC",
            (referral_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_referral_version(referral_id: str, version_number: int) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM referral_versions WHERE referral_id = ? AND version_number = ?",
            (referral_id, version_number),
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["data"] = json.loads(d["data"])
        return d


# ===== Referral Operations =====

def save_referral(record: ReferralRecord) -> None:
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO referrals (referral_id, data, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(referral_id) DO UPDATE SET
                data = excluded.data,
                updated_at = CURRENT_TIMESTAMP
        """, (record.referral_id, record.model_dump_json()))


def get_referral(referral_id: str) -> ReferralRecord | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT data FROM referrals WHERE referral_id = ?", (referral_id,)
        ).fetchone()
        if row is None:
            return None
        return ReferralRecord.model_validate(json.loads(row["data"]))


def list_all_referrals() -> list[ReferralRecord]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT data FROM referrals ORDER BY created_at ASC"
        ).fetchall()
        return [ReferralRecord.model_validate(json.loads(row["data"])) for row in rows]


# ===== Clinic Operations =====

def list_clinics(locality: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        if locality:
            rows = conn.execute("SELECT * FROM clinics WHERE locality LIKE ? ORDER BY name ASC", (f"%{locality}%",)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM clinics ORDER BY name ASC").fetchall()
        
        result = []
        for r in rows:
            d = dict(r)
            d["specialities"] = json.loads(d["specialities"]) if d["specialities"] else []
            result.append(d)
        return result


def get_clinic(clinic_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM clinics WHERE id = ?", (clinic_id,)).fetchone()
        if not row:
            return None
        d = dict(row)
        d["specialities"] = json.loads(d["specialities"]) if d["specialities"] else []
        return d


def save_clinic(clinic: Clinic) -> Dict[str, Any]:
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO clinics (id, name, address, locality, city, state, pincode, phone, email, specialities)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, address=excluded.address, locality=excluded.locality,
                city=excluded.city, state=excluded.state, pincode=excluded.pincode,
                phone=excluded.phone, email=excluded.email, specialities=excluded.specialities
        """, (clinic.id, clinic.name, clinic.address, clinic.locality, clinic.city, clinic.state, clinic.pincode, clinic.phone, clinic.email, json.dumps(clinic.specialities)))
        # Read back on the SAME connection/transaction, not via get_clinic()
        # (which opens a separate connection that cannot see this write until
        # this `with` block's commit() runs -- see docs/IMPLEMENTATION_PROGRESS.md
        # "SQLite same-connection read-after-write" fix).
        row = conn.execute("SELECT * FROM clinics WHERE id = ?", (clinic.id,)).fetchone()
        d = dict(row)
        d["specialities"] = json.loads(d["specialities"]) if d["specialities"] else []
        return d


def delete_clinic(clinic_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM clinics WHERE id = ?", (clinic_id,))
        return cursor.rowcount > 0


# ===== Doctor Operations =====

def list_doctors(clinic_id: Optional[str] = None, specialization: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        query = "SELECT d.*, c.name as clinic_name, c.locality as clinic_locality FROM doctors d JOIN clinics c ON d.clinic_id = c.id WHERE 1=1"
        params = []
        if clinic_id:
            query += " AND d.clinic_id = ?"
            params.append(clinic_id)
        if specialization:
            query += " AND d.specialization LIKE ?"
            params.append(f"%{specialization}%")
        query += " ORDER BY d.name ASC"
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_doctor(doctor_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("""
            SELECT d.*, c.name as clinic_name, c.locality as clinic_locality 
            FROM doctors d JOIN clinics c ON d.clinic_id = c.id 
            WHERE d.id = ?
        """, (doctor_id,)).fetchone()
        return dict(row) if row else None


def save_doctor(doctor: Doctor) -> Dict[str, Any]:
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO doctors (id, clinic_id, name, specialization, qualification, phone, email, availability)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                clinic_id=excluded.clinic_id, name=excluded.name, specialization=excluded.specialization,
                qualification=excluded.qualification, phone=excluded.phone, email=excluded.email, availability=excluded.availability
        """, (doctor.id, doctor.clinic_id, doctor.name, doctor.specialization, doctor.qualification, doctor.phone, doctor.email, doctor.availability))
        # Same-connection read-after-write (see save_clinic for why get_doctor()
        # cannot be called here -- it would open a second, pre-commit connection).
        row = conn.execute("""
            SELECT d.*, c.name as clinic_name, c.locality as clinic_locality
            FROM doctors d JOIN clinics c ON d.clinic_id = c.id
            WHERE d.id = ?
        """, (doctor.id,)).fetchone()
        return dict(row) if row else None


def delete_doctor(doctor_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM doctors WHERE id = ?", (doctor_id,))
        return cursor.rowcount > 0


# ===== Patient Operations =====

def list_patients() -> List[Dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM patients ORDER BY name ASC").fetchall()
        return [dict(r) for r in rows]


def get_patient(patient_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM patients WHERE id = ?", (patient_id,)).fetchone()
        return dict(row) if row else None


def save_patient(patient: Patient) -> Dict[str, Any]:
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO patients (id, name, age, sex, phone, email, address, medical_history, allergies)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, age=excluded.age, sex=excluded.sex, phone=excluded.phone,
                email=excluded.email, address=excluded.address, medical_history=excluded.medical_history, allergies=excluded.allergies
        """, (patient.id, patient.name, patient.age, patient.sex, patient.phone, patient.email, patient.address, patient.medical_history, patient.allergies))
        # Same-connection read-after-write (see save_clinic).
        row = conn.execute("SELECT * FROM patients WHERE id = ?", (patient.id,)).fetchone()
        return dict(row) if row else None


# ===== Appointment Operations =====

def list_appointments(clinic_id: Optional[str] = None, doctor_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        query = """
            SELECT a.*, c.name as clinic_name, c.locality as clinic_locality, d.name as doctor_name, d.specialization as doctor_specialization
            FROM appointments a
            LEFT JOIN clinics c ON a.clinic_id = c.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE 1=1
        """
        params = []
        if clinic_id:
            query += " AND a.clinic_id = ?"
            params.append(clinic_id)
        if doctor_id:
            query += " AND a.doctor_id = ?"
            params.append(doctor_id)
        query += " ORDER BY a.appointment_date ASC, a.appointment_time ASC"
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def get_appointment(appointment_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        row = conn.execute("""
            SELECT a.*, c.name as clinic_name, c.locality as clinic_locality, d.name as doctor_name, d.specialization as doctor_specialization
            FROM appointments a
            LEFT JOIN clinics c ON a.clinic_id = c.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE a.id = ?
        """, (appointment_id,)).fetchone()
        return dict(row) if row else None


def save_appointment(appointment: Appointment) -> Dict[str, Any]:
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO appointments (id, clinic_id, doctor_id, patient_name, patient_phone, patient_age, patient_sex, appointment_date, appointment_time, reason, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                clinic_id=excluded.clinic_id, doctor_id=excluded.doctor_id, patient_name=excluded.patient_name,
                patient_phone=excluded.patient_phone, patient_age=excluded.patient_age, patient_sex=excluded.patient_sex,
                appointment_date=excluded.appointment_date, appointment_time=excluded.appointment_time,
                reason=excluded.reason, status=excluded.status
        """, (appointment.id, appointment.clinic_id, appointment.doctor_id, appointment.patient_name, appointment.patient_phone, appointment.patient_age, appointment.patient_sex, appointment.appointment_date, appointment.appointment_time, appointment.reason, appointment.status))
        # Same-connection read-after-write (see save_clinic).
        row = conn.execute("""
            SELECT a.*, c.name as clinic_name, c.locality as clinic_locality, d.name as doctor_name, d.specialization as doctor_specialization
            FROM appointments a
            LEFT JOIN clinics c ON a.clinic_id = c.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE a.id = ?
        """, (appointment.id,)).fetchone()
        return dict(row) if row else None


def update_appointment_status(appointment_id: str, status: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        conn.execute("UPDATE appointments SET status = ? WHERE id = ?", (status, appointment_id))
        # Same-connection read-after-write (see save_clinic) -- get_appointment()
        # would open a second, pre-commit connection and see the pre-update row.
        row = conn.execute("""
            SELECT a.*, c.name as clinic_name, c.locality as clinic_locality, d.name as doctor_name, d.specialization as doctor_specialization
            FROM appointments a
            LEFT JOIN clinics c ON a.clinic_id = c.id
            LEFT JOIN doctors d ON a.doctor_id = d.id
            WHERE a.id = ?
        """, (appointment_id,)).fetchone()
        return dict(row) if row else None

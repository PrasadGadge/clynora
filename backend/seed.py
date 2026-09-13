#!/usr/bin/env python3
"""
ClinBridge — Database seed / reset script.

Usage (from backend/):
    python seed.py            # create tables + seed if empty (idempotent)
    python seed.py --reset    # DROP all tables first, then recreate + seed

Seeds:
    - Pune clinics/doctors/appointments (original demo directory data)
    - Demo user accounts, one per role (see app/db.seed_demo_users)
    - ~60 additional synthetic patients (SYN-PAT-##### IDs) with
      realistic-but-fabricated names, ages, conditions, and allergies —
      NOT real patient data. Extends the original 3-patient seed toward
      the Master Instruction's 50-200 patient target for demo purposes.
"""

import argparse
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import db  # noqa: E402

FIRST_NAMES_M = [
    "Suresh", "Prakash", "Rajesh", "Amit", "Vikram", "Anand", "Vivek", "Sanjay",
    "Nitin", "Ravindra", "Ganesh", "Mahesh", "Ashok", "Dinesh", "Sachin",
    "Ramesh", "Kiran", "Yogesh", "Milind", "Abhijit", "Manoj", "Sunil",
]
FIRST_NAMES_F = [
    "Anjali", "Sunita", "Meera", "Priya", "Neha", "Kavita", "Shalini", "Pooja",
    "Rekha", "Deepa", "Aarti", "Snehal", "Manisha", "Swati", "Vaishali",
    "Smita", "Jyoti", "Nikita", "Radhika", "Asha", "Varsha", "Leena",
]
LAST_NAMES = [
    "Kulkarni", "Deshmukh", "Joshi", "Patil", "Shinde", "Gokhale", "Kute",
    "Rao", "Bapat", "Deshpande", "Kadam", "Bhosale", "Chavan", "Pawar",
    "More", "Jadhav", "Gaikwad", "Sawant", "Kolhe", "Naik", "Kamble",
]
CONDITIONS = [
    "Hypertension", "Type 2 Diabetes", "Asthma", "Hypothyroidism",
    "Coronary Artery Disease", "Chronic Kidney Disease (stage 2)",
    "Osteoarthritis", "GERD", "Migraine", "Anxiety Disorder",
    "Hyperlipidemia", "Obesity", "Chronic Bronchitis", "None documented",
]
ALLERGIES = [
    "Penicillin", "Sulfa drugs", "Aspirin", "None documented",
    "None documented", "None documented", "Dust", "Shellfish", "Latex",
]
LOCALITIES = ["Kothrud", "Baner", "Hinjewadi", "Viman Nagar", "Shivajinagar", "Kalyani Nagar"]


def synthetic_patients(n: int, start_index: int = 4):
    """Generates n additional synthetic patients as (id, name, age, sex, phone, email, address, history, allergies) tuples."""
    rng = random.Random(42)  # fixed seed -> reproducible across `python seed.py` runs
    rows = []
    for i in range(n):
        idx = start_index + i
        sex = rng.choice(["male", "female"])
        first = rng.choice(FIRST_NAMES_M if sex == "male" else FIRST_NAMES_F)
        last = rng.choice(LAST_NAMES)
        age = rng.randint(19, 88)
        locality = rng.choice(LOCALITIES)
        history = rng.choice(CONDITIONS)
        allergy = rng.choice(ALLERGIES)
        pid = f"SYN-PAT-{idx:05d}"
        phone = f"+91 9{rng.randint(1000,9999):04d}{rng.randint(10000,99999):05d}"
        rows.append((
            pid, f"{first} {last}", age, sex, phone,
            f"{first.lower()}.{last.lower()}{idx}@example-demo.in",
            f"{locality}, Pune, Maharashtra",
            history, allergy,
        ))
    return rows


def seed_synthetic_patients(target_total: int = 60):
    existing = db.list_patients()
    if len(existing) >= target_total:
        print(f"Patients table already has {len(existing)} rows (>= target {target_total}); skipping.")
        return
    needed = target_total - len(existing)
    rows = synthetic_patients(needed, start_index=len(existing) + 1)
    with db.get_connection() as conn:
        conn.executemany(
            """
            INSERT OR IGNORE INTO patients (id, name, age, sex, phone, email, address, medical_history, allergies)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )
    print(f"Seeded {len(rows)} additional synthetic patients (total target: {target_total}).")


def reset_database():
    with db.get_connection() as conn:
        tables = [r["name"] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()]
        for t in tables:
            conn.execute(f"DROP TABLE IF EXISTS {t}")
    print(f"Dropped tables: {', '.join(tables) if tables else '(none existed)'}")


def main():
    parser = argparse.ArgumentParser(description="Seed or reset the ClinBridge database.")
    parser.add_argument("--reset", action="store_true", help="Drop all tables before reseeding.")
    parser.add_argument("--patients", type=int, default=60, help="Target total patient count (default 60, max useful ~200).")
    args = parser.parse_args()

    if args.reset:
        reset_database()

    db.init_db()  # creates tables; seeds Pune clinics/doctors/appointments + demo users if empty
    seed_synthetic_patients(target_total=args.patients)

    print("Done. Demo accounts: admin, dr.deshmukh, dr.rao, coordinator1 "
          "(password: CLINBRIDGE_DEMO_PASSWORD env var, see .env.example).")


if __name__ == "__main__":
    main()

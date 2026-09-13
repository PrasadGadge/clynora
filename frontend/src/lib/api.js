/**
 * ClinBridge frontend API layer.
 * Types mirror /app/backend/app/schemas/referral.py exactly.
 * All calls go through REACT_APP_BACKEND_URL and are prefixed with /api.
 */
import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
const API = `${BASE}/api`;

export const http = axios.create({
  baseURL: API,
  headers: { "Content-Type": "application/json" },
});

// Attach the session token (set at login) to every request.
http.interceptors.request.use((config) => {
  const token = localStorage.getItem("clinbridge_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A rejected/expired session clears local state AND forces a return to
// login (a cleared token alone doesn't help if the user never navigates
// again -- RequireRole in App.js would only catch it on the next route
// change). Guarded against redirect loops if already on /login.
http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      localStorage.removeItem("clinbridge_token");
      localStorage.removeItem("clinbridge_role");
      localStorage.removeItem("clinbridge_username");
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Normalizes any axios error into a single human-readable string. Handles
 * the cases the backend/network can actually produce:
 * - No `response` at all -> network failure / backend unreachable.
 * - `response.data.detail` as a plain string (every handwritten
 *   HTTPException in this backend uses this shape) -> used directly.
 * - `response.data.detail` as a LIST of {loc, msg, type} objects (FastAPI's
 *   automatic request-body validation errors, e.g. a malformed payload
 *   returning 422) -> joined into one readable line instead of being
 *   passed as a raw object/array to a toast (which would render as
 *   "[object Object]" or similar).
 * - Nothing usable -> a generic fallback. Never surfaces a raw stack trace
 *   (the backend's centralized handler already guarantees 500s don't
 *   contain one; this is defense on the frontend side too).
 */
export function getErrorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!err?.response) {
    return "Cannot reach the ClinBridge server. Check that the backend is running and try again.";
  }
  const detail = err.response.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((d) => {
        const field = Array.isArray(d?.loc) ? d.loc.filter((p) => p !== "body").join(".") : null;
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .filter(Boolean)
      .join("; ") || fallback;
  }
  return err.message || fallback;
}

// ===== Auth =====

export async function login(username, password) {
  const { data } = await http.post("/auth/login", { username, password });
  return data;
}

// ===== Types (mirror backend Pydantic models) =====

export const STATUS_VALUES = ["created", "reviewed", "approved", "sent", "acknowledged", "closed", "rejected"];
export const BAND_VALUES = ["ready_for_review", "needs_information", "requires_attention"];

export const BAND_LABEL = {
  ready_for_review: "Ready for Review",
  needs_information: "Needs Information",
  requires_attention: "Requires Attention",
};

export const STATUS_LABEL = {
  created: "Created",
  reviewed: "Reviewed",
  approved: "Approved",
  sent: "Sent",
  acknowledged: "Acknowledged",
  closed: "Closed",
  rejected: "Rejected",
};

// ===== API calls =====

export async function createReferral(rawText) {
  const { data } = await http.post("/referrals", { raw_text: rawText });
  return data;
}

export async function listReferrals() {
  const { data } = await http.get("/referrals");
  return data;
}

export async function getReferral(id) {
  const { data } = await http.get(`/referrals/${id}`);
  return data;
}

export async function approveReferral(id, editedSbar) {
  const { data } = await http.post(`/referrals/${id}/approve`, {
    edited_sbar: editedSbar ?? null,
  });
  return data;
}

export async function updateReferralStatus(id, status) {
  const { data } = await http.patch(`/referrals/${id}/status`, null, {
    params: { status },
  });
  return data;
}

export async function getReferralHistory(id) {
  const { data } = await http.get(`/referrals/${id}/history`);
  return data;
}

export async function getReferralVersions(id) {
  const { data } = await http.get(`/referrals/${id}/versions`);
  return data;
}

// ===== Clinic & Doctor API calls =====

export async function listClinics(locality) {
  const params = locality ? { locality } : {};
  const { data } = await http.get("/clinics", { params });
  return data;
}

export async function getClinic(id) {
  const { data } = await http.get(`/clinics/${id}`);
  return data;
}

export async function listDoctors(clinicId, specialization) {
  const params = {};
  if (clinicId) params.clinic_id = clinicId;
  if (specialization) params.specialization = specialization;
  const { data } = await http.get("/doctors", { params });
  return data;
}

export async function getDoctor(id) {
  const { data } = await http.get(`/doctors/${id}`);
  return data;
}

// ===== Patient API calls =====

export async function listPatients() {
  const { data } = await http.get("/patients");
  return data;
}

export async function createPatient(patientData) {
  const { data } = await http.post("/patients", patientData);
  return data;
}

// ===== Appointment API calls =====

export async function listAppointments(clinicId, doctorId) {
  const params = {};
  if (clinicId) params.clinic_id = clinicId;
  if (doctorId) params.doctor_id = doctorId;
  const { data } = await http.get("/appointments", { params });
  return data;
}

export async function createAppointment(appointmentData) {
  const { data } = await http.post("/appointments", appointmentData);
  return data;
}

export async function updateAppointmentStatus(id, status) {
  const { data } = await http.patch(`/appointments/${id}/status`, null, {
    params: { status },
  });
  return data;
}

// ===== Human-readable labels for missing fields =====

export const MISSING_FIELD_LABEL = {
  patient_age: "Patient age",
  patient_sex: "Patient sex",
  reason_for_referral: "Reason for referral",
  referred_to: "Referral destination",
  referring_physician_contact: "Referring physician contact",
  history: "Clinical history",
  medications: "Medications",
  allergies: "Allergies",
  investigations: "Investigations",
  vitals: "Vital signs",
};

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { listClinics, listDoctors, listAppointments, createAppointment, getErrorMessage } from '../lib/api';
import { Building2, UserCheck, Calendar, MapPin, Phone, Mail, Clock, Search, Filter, CheckCircle2, AlertCircle } from 'lucide-react';

const PUNE_LOCALITIES = [
  'All Localities',
  'Kothrud',
  'Baner',
  'Hinjewadi',
  'Viman Nagar',
  'Shivajinagar',
  'Kalyani Nagar'
];

export default function DirectoryPage() {
  const queryClient = useQueryClient();
  const [selectedLocality, setSelectedLocality] = useState('All Localities');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClinic, setSelectedClinic] = useState(null);
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Form state for booking
  const today = new Date().toISOString().slice(0, 10);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientSex, setPatientSex] = useState('female');
  const [aptDate, setAptDate] = useState(today);
  const [aptTime, setAptTime] = useState('11:00 AM');
  const [reason, setReason] = useState('');

  // Queries
  const { data: clinics = [], isLoading: loadingClinics, error: errorClinics } = useQuery({
    queryKey: ['clinics', selectedLocality],
    queryFn: () => listClinics(selectedLocality === 'All Localities' ? null : selectedLocality),
  });

  const { data: doctors = [], isLoading: loadingDoctors } = useQuery({
    queryKey: ['doctors', selectedClinic?.id],
    queryFn: () => listDoctors(selectedClinic?.id || null),
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ['appointments'],
    queryFn: () => listAppointments(),
  });

  // Booking mutation
  const bookingMutation = useMutation({
    mutationFn: createAppointment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      setBookingSuccess(true);
      toast.success("Appointment booked successfully");
      setTimeout(() => {
        setBookingSuccess(false);
        setBookingDoctor(null);
        setPatientName('');
        setPatientPhone('');
        setReason('');
      }, 2000);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Failed to book appointment. Please check details."));
    },
  });

  const filteredClinics = clinics.filter((c) => {
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.specialities.some(s => s.toLowerCase().includes(q));
  });

  const handleBook = (e) => {
    e.preventDefault();
    if (!bookingDoctor || !patientName || !patientPhone) return;

    bookingMutation.mutate({
      clinic_id: bookingDoctor.clinic_id,
      doctor_id: bookingDoctor.id,
      patient_name: patientName,
      patient_phone: patientPhone,
      patient_age: patientAge ? parseInt(patientAge, 10) : null,
      patient_sex: patientSex,
      appointment_date: aptDate,
      appointment_time: aptTime,
      reason: reason || 'Specialist Referral / Consultation',
    });
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs uppercase tracking-wider mb-1">
            <MapPin className="h-3.5 w-3.5" /> Pune Healthcare Network
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Pune Clinics & Specialists Directory</h1>
          <p className="text-sm text-slate-500 mt-1">
            Browse example medical clinics and specialist doctors for Pune, Maharashtra. Seeded directly into the ClinBridge database.
          </p>
          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800"
            data-testid="directory-synthetic-data-badge"
          >
            <AlertCircle className="h-3 w-3" /> Synthetic Demo Data — No real patient, clinic, or doctor information
          </div>
        </div>
      </div>

      {/* Search and Locality Filter Bar */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search clinics, specialities, or localities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2F6B4F]"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          {PUNE_LOCALITIES.map((loc) => (
            <button
              key={loc}
              onClick={() => setSelectedLocality(loc)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedLocality === loc
                    ? "bg-[#2F6B4F] text-white"
                      : "bg-white text-slate-600 border border-slate-200"
                  }`}
            >
              {loc}
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Clinics List & Specialists */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Clinics List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#2F6B4F]" /> Clinics ({filteredClinics.length})
            </h2>
            {selectedClinic && (
              <button
                onClick={() => setSelectedClinic(null)}
                className="text-xs text-[#2F6B4F] hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>

          {loadingClinics && <div className="p-8 text-center text-sm text-slate-500">Loading Pune clinics from database…</div>}
          {errorClinics && (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Unable to load clinics from backend database.
            </div>
          )}

          {!loadingClinics && filteredClinics.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
              No clinics match your criteria.
            </div>
          )}

          <div className="space-y-3">
            {filteredClinics.map((clinic) => {
              const isSelected = selectedClinic?.id === clinic.id;
              return (
                <div
                  key={clinic.id}
                  onClick={() => setSelectedClinic(isSelected ? null : clinic)}
                  className={`bg-white border rounded-xl p-5 transition-all cursor-pointer shadow-sm ${
                    isSelected
                      ? "border-[#2F6B4F] ring-2 ring-[#2F6B4F]/20"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">{clinic.id}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {clinic.locality}, Pune
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-slate-900 mt-1">{clinic.name}</h3>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{clinic.address}</span>
                    </div>
                    <div className="flex items-center gap-4 pt-1">
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        <span>{clinic.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-slate-400" />
                        <span>{clinic.email}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                    {clinic.specialities.map((spec) => (
                      <span key={spec} className="text-xs bg-slate-50 text-slate-700 border border-slate-200/60 px-2 py-0.5 rounded">
                        {spec}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Specialists & Booking */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-[#2F6B4F]" />
                {selectedClinic ? `Specialists at ${selectedClinic.name}` : 'All Pune Specialists'}
              </span>
              <span className="text-xs font-mono text-slate-500">{doctors.length} doctors</span>
            </h2>

            {loadingDoctors && <div className="p-6 text-center text-sm text-slate-500">Loading specialist doctors…</div>}

            {!loadingDoctors && doctors.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-400">No specialists found for selected clinic.</div>
            )}

            <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
              {doctors.map((doc) => (
                <div key={doc.id} className="border border-slate-200 rounded-lg p-3.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900">{doc.name}</h4>
                      <div className="text-xs font-medium text-emerald-800">{doc.specialization}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{doc.qualification}</div>
                      <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {doc.clinic_name} ({doc.clinic_locality})
                      </div>
                    </div>
                    <button
                      onClick={() => setBookingDoctor(doc)}
                      className="px-2.5 py-1.5 bg-[#2F6B4F] hover:bg-[#1E4634] text-white text-xs font-medium rounded-md flex items-center gap-1 shadow-sm"
                    >
                      <Calendar className="h-3.5 w-3.5" /> Book
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3 text-slate-400" /> {doc.availability}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Appointments Count Badge */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-600 text-white grid place-items-center">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-emerald-950">Appointments in Database</div>
                <div className="text-xs text-emerald-700">Persisted across system restarts</div>
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-900">{appointments.length}</div>
          </div>
        </div>
      </div>

      {/* Booking Modal / Dialog */}
      {bookingDoctor && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Book Appointment</h3>
                <p className="text-xs text-slate-500">With {bookingDoctor.name} ({bookingDoctor.specialization})</p>
              </div>
              <button
                onClick={() => setBookingDoctor(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {bookingSuccess ? (
              <div className="p-6 text-center space-y-2">
                <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
                <h4 className="text-base font-bold text-slate-900">Appointment Confirmed!</h4>
                <p className="text-xs text-slate-500">Saved to database for {patientName}.</p>
              </div>
            ) : (
              <form onSubmit={handleBook} className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Patient Name</label>
                  <input
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="e.g. Ramesh Kulkarni"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#2F6B4F] outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                    <input
                      type="text"
                      required
                      value={patientPhone}
                      onChange={(e) => setPatientPhone(e.target.value)}
                      placeholder="+91 98220..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#2F6B4F] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Age & Sex</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        value={patientAge}
                        onChange={(e) => setPatientAge(e.target.value)}
                        placeholder="Age"
                        className="w-16 px-2 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#2F6B4F] outline-none"
                      />
                      <select
                        value={patientSex}
                        onChange={(e) => setPatientSex(e.target.value)}
                        className="flex-1 px-2 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#2F6B4F] outline-none"
                      >
                        <option value="female">Female</option>
                        <option value="male">Male</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={aptDate}
                      onChange={(e) => setAptDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#2F6B4F] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Preferred Time</label>
                    <input
                      type="text"
                      required
                      value={aptTime}
                      onChange={(e) => setAptTime(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#2F6B4F] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Visit / Symptoms</label>
                  <textarea
                    rows="2"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Chest pain referral / Routine checkup"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-[#2F6B4F] outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setBookingDoctor(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bookingMutation.isPending}
                    className="px-4 py-2 bg-[#2F6B4F] hover:bg-[#1E4634] text-white text-xs font-medium rounded-lg flex items-center gap-1"
                  >
                    {bookingMutation.isPending ? 'Saving to Database…' : 'Confirm & Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
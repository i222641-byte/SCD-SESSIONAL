import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4001;

// Demo data. In a production system, these records would be stored in a database.
const doctors = [
  { id: 1, name: "Dr. Ayesha Khan", specialty: "Cardiology", available: true },
  { id: 2, name: "Dr. Hamza Ali", specialty: "Dermatology", available: true },
  { id: 3, name: "Dr. Sara Ahmed", specialty: "Pediatrics", available: false },
  { id: 4, name: "Dr. Usman Malik", specialty: "Orthopedics", available: true }
];

let appointments = [
  {
    id: 1001,
    patientName: "Ali Raza",
    doctorId: 1,
    date: "2026-11-10",
    time: "10:00",
    reason: "Routine check-up",
    status: "Confirmed"
  }
];
let nextAppointmentId = 1002;

// Health endpoint used to verify backend availability through the single entry point.
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "hospital-appointment-api", timestamp: new Date().toISOString() });
});

// API: list doctors
app.get("/api/doctors", (req, res) => {
  res.json(doctors);
});

// API: list appointments, optionally filter by patient name
app.get("/api/appointments", (req, res) => {
  const patient = String(req.query.patient || "").trim().toLowerCase();
  const result = patient
    ? appointments.filter((item) => item.patientName.toLowerCase().includes(patient))
    : appointments;
  res.json(result);
});

// API: create an appointment
app.post("/api/appointments", (req, res) => {
  const { patientName, doctorId, date, time, reason } = req.body;

  if (!patientName?.trim() || !doctorId || !date || !time) {
    return res.status(400).json({
      error: "Patient name, doctor, date, and time are required."
    });
  }

  const doctor = doctors.find((item) => item.id === Number(doctorId));
  if (!doctor) {
    return res.status(404).json({ error: "Selected doctor was not found." });
  }
  if (!doctor.available) {
    return res.status(409).json({ error: "This doctor is currently unavailable." });
  }

  const appointment = {
    id: nextAppointmentId++,
    patientName: patientName.trim(),
    doctorId: doctor.id,
    date,
    time,
    reason: reason?.trim() || "Not provided",
    status: "Pending"
  };

  appointments.push(appointment);
  res.status(201).json(appointment);
});

// API: update appointment status
app.patch("/api/appointments/:id", (req, res) => {
  const appointment = appointments.find((item) => item.id === Number(req.params.id));
  if (!appointment) {
    return res.status(404).json({ error: "Appointment not found." });
  }

  const allowedStatuses = ["Pending", "Confirmed", "Cancelled"];
  if (!allowedStatuses.includes(req.body.status)) {
    return res.status(400).json({ error: "Invalid appointment status." });
  }

  appointment.status = req.body.status;
  res.json(appointment);
});

// API: cancel/remove an appointment
app.delete("/api/appointments/:id", (req, res) => {
  const index = appointments.findIndex((item) => item.id === Number(req.params.id));
  if (index === -1) {
    return res.status(404).json({ error: "Appointment not found." });
  }

  const [deleted] = appointments.splice(index, 1);
  res.json({ message: "Appointment removed successfully.", appointment: deleted });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Hospital Appointment API listening on http://127.0.0.1:${PORT}`);
});

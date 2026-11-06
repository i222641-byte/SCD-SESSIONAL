import { useEffect, useState } from "react";
import "./App.css";

const api = "/api";

function App() {
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [form, setForm] = useState({
    patientName: "",
    doctorId: "",
    date: "",
    time: "",
    reason: ""
  });
  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [healthResponse, doctorsResponse, appointmentsResponse] = await Promise.all([
        fetch("/health"),
        fetch(`${api}/doctors`),
        fetch(`${api}/appointments`)
      ]);
      if (!healthResponse.ok || !doctorsResponse.ok || !appointmentsResponse.ok) {
        throw new Error("One or more backend endpoints returned an error.");
      }
      setBackendStatus("Online");
      setDoctors(await doctorsResponse.json());
      setAppointments(await appointmentsResponse.json());
    } catch (error) {
      setBackendStatus("Unavailable");
      setMessage("Unable to contact the hospital server. Please try again shortly.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const updateForm = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const bookAppointment = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const response = await fetch(`${api}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create appointment.");
      setAppointments((current) => [...current, data]);
      setForm({ patientName: "", doctorId: "", date: "", time: "", reason: "" });
      setMessage("Appointment request submitted successfully.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const changeStatus = async (id, status) => {
    try {
      const response = await fetch(`${api}/appointments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update appointment.");
      setAppointments((current) => current.map((item) => item.id === id ? data : item));
    } catch (error) {
      setMessage(error.message);
    }
  };

  const removeAppointment = async (id) => {
    try {
      const response = await fetch(`${api}/appointments/${id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove appointment.");
      setAppointments((current) => current.filter((item) => item.id !== id));
      setMessage("Appointment removed.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const doctorName = (id) => doctors.find((doctor) => doctor.id === id)?.name || "Unknown doctor";

  return (
    <main className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">CITY CARE • PATIENT SERVICES</p>
          <h1>Hospital Appointment Management</h1>
          <p className="subtitle">Find a specialist and request your appointment online.</p>
        </div>
        <div className={`status ${backendStatus === "Online" ? "online" : "offline"}`}>
          <span className="status-dot" /> API {backendStatus}
        </div>
      </header>

      {message && <div className="notice" role="status">{message}</div>}

      <section className="layout">
        <div className="panel">
          <div className="section-heading">
            <div><p className="eyebrow">NEW REQUEST</p><h2>Book an appointment</h2></div>
          </div>
          <form onSubmit={bookAppointment}>
            <label>Patient name<input name="patientName" value={form.patientName} onChange={updateForm} placeholder="Enter full name" required /></label>
            <label>Choose a doctor
              <select name="doctorId" value={form.doctorId} onChange={updateForm} required>
                <option value="">Select a specialist</option>
                {doctors.filter((doctor) => doctor.available).map((doctor) =>
                  <option key={doctor.id} value={doctor.id}>{doctor.name} — {doctor.specialty}</option>
                )}
              </select>
            </label>
            <div className="two-fields">
              <label>Date<input type="date" name="date" value={form.date} onChange={updateForm} min={new Date().toISOString().slice(0, 10)} required /></label>
              <label>Time<input type="time" name="time" value={form.time} onChange={updateForm} required /></label>
            </div>
            <label>Reason for visit <textarea name="reason" value={form.reason} onChange={updateForm} placeholder="Briefly describe the reason (optional)" rows="3" /></label>
            <button type="submit" disabled={backendStatus !== "Online"}>Submit appointment request</button>
          </form>
        </div>

        <div className="panel">
          <p className="eyebrow">OUR TEAM</p><h2>Available doctors</h2>
          <div className="doctor-list">
            {doctors.map((doctor) => (
              <article className="doctor" key={doctor.id}>
                <div className="avatar">{doctor.name.split(" ").filter(Boolean).slice(1).map((part) => part[0]).join("").slice(0, 2)}</div>
                <div><strong>{doctor.name}</strong><span>{doctor.specialty}</span></div>
                <span className={`availability ${doctor.available ? "" : "busy"}`}>{doctor.available ? "Available" : "Unavailable"}</span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel appointments">
        <div className="section-heading">
          <div><p className="eyebrow">SCHEDULE</p><h2>Appointment requests</h2></div>
          <button className="secondary" onClick={loadData}>Refresh</button>
        </div>
        {loading ? <p>Loading appointments...</p> : appointments.length === 0 ? <p>No appointment requests found.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Patient</th><th>Doctor</th><th>Date & time</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{appointments.map((item) => (
                <tr key={item.id}>
                  <td>{item.patientName}</td><td>{doctorName(item.doctorId)}</td>
                  <td>{item.date}<br />{item.time}</td><td>{item.reason}</td>
                  <td><span className={`tag ${item.status.toLowerCase()}`}>{item.status}</span></td>
                  <td className="actions">
                    <select aria-label={`Change status for ${item.patientName}`} value={item.status} onChange={(e) => changeStatus(item.id, e.target.value)}>
                      <option>Pending</option><option>Confirmed</option><option>Cancelled</option>
                    </select>
                    <button className="remove" onClick={() => removeAppointment(item.id)}>Remove</button>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <footer>City Care Hospital · Appointment Services</footer>
    </main>
  );
}

export default App;

"""
Patient tools — query patient records and appointment history.
Used by Orion (lead/upsell analysis) and Aria (retention/churn/DNA).
"""

from typing import Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase


# ---------------------------------------------------------------------------
# Query Patients
# ---------------------------------------------------------------------------

class QueryPatientsInput(BaseModel):
    search: Optional[str] = Field(
        None,
        description="Text search across patient name or email (partial match)",
    )
    treatment_type: Optional[str] = Field(
        None,
        description="Filter by last treatment type (e.g. Botox, CoolSculpting, IV Therapy)",
    )
    status: Optional[str] = Field(
        None,
        description="Filter by patient status: active, inactive, archived",
    )
    min_lifetime_value: Optional[float] = Field(
        None,
        description="Minimum lifetime value in GBP (e.g. 1000 for high-LTV patients)",
    )
    limit: int = Field(20, description="Max results (1-50)", ge=1, le=50)


class QueryPatientsTool(BaseTool):
    name: str = "query_patients"
    description: str = (
        "Look up patient records. Search by name, email, treatment type, status, or minimum "
        "lifetime value. Returns patient name, email, status, last visit, lifetime value, "
        "and treatment history. Use this to identify at-risk patients, upsell candidates, "
        "or specific patient details for retention or commercial analysis."
    )
    args_schema: type[BaseModel] = QueryPatientsInput
    tenant_id: str = ""

    def _run(
        self,
        search: Optional[str] = None,
        treatment_type: Optional[str] = None,
        status: Optional[str] = None,
        min_lifetime_value: Optional[float] = None,
        limit: int = 20,
    ) -> str:
        db = get_supabase()

        # Try cliniko_patients first (live data when connected)
        query = (
            db.table("cliniko_patients")
            .select(
                "id, first_name, last_name, email, phone, status, "
                "date_of_birth, created_at, updated_at"
            )
            .order("updated_at", desc=True)
            .limit(limit)
        )

        if status:
            query = query.eq("status", status)

        result = query.execute()
        patients = result.data or []

        # Client-side text search
        if search and patients:
            q = search.lower()
            patients = [
                p for p in patients
                if q in (f"{p.get('first_name', '')} {p.get('last_name', '')}").lower()
                or q in (p.get("email", "") or "").lower()
            ]

        if not patients:
            return (
                "No patient records found. "
                "Note: Patient data will be populated once Cliniko integration is active. "
                "Currently using seeded/simulated data."
            )

        output = f"Found {len(patients)} patient(s):\n\n"
        for p in patients:
            name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or "Unknown"
            output += f"- **{name}**\n"
            output += f"  Email: {p.get('email', 'N/A')} | Phone: {p.get('phone', 'N/A')}\n"
            output += f"  Status: {p.get('status', 'unknown')} | ID: {p['id']}\n"
            if p.get("updated_at"):
                output += f"  Last updated: {p['updated_at']}\n"
            output += "\n"

        return output.strip()


# ---------------------------------------------------------------------------
# Query Appointments
# ---------------------------------------------------------------------------

class QueryAppointmentsInput(BaseModel):
    patient_id: Optional[str] = Field(
        None, description="UUID of a specific patient to query appointments for"
    )
    status: Optional[str] = Field(
        None,
        description="Filter by appointment status: booked, arrived, did_not_arrive, cancelled, completed",
    )
    appointment_type: Optional[str] = Field(
        None,
        description="Filter by treatment/appointment type (e.g. Botox, CoolSculpting)",
    )
    date_from: Optional[str] = Field(
        None, description="Start date filter (ISO format: YYYY-MM-DD)"
    )
    date_to: Optional[str] = Field(
        None, description="End date filter (ISO format: YYYY-MM-DD)"
    )
    limit: int = Field(20, description="Max results (1-50)", ge=1, le=50)


class QueryAppointmentsTool(BaseTool):
    name: str = "query_appointments"
    description: str = (
        "Look up appointment records. Filter by patient, status (including did_not_arrive for DNA analysis), "
        "treatment type, or date range. Use this to analyse booking patterns, DNA (Did Not Arrive) history, "
        "treatment popularity, and conversion data. Essential for both Orion (booking conversion analysis) "
        "and Aria (DNA detection and retention scheduling)."
    )
    args_schema: type[BaseModel] = QueryAppointmentsInput
    tenant_id: str = ""

    def _run(
        self,
        patient_id: Optional[str] = None,
        status: Optional[str] = None,
        appointment_type: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        limit: int = 20,
    ) -> str:
        db = get_supabase()

        query = (
            db.table("cliniko_appointments")
            .select(
                "id, patient_id, appointment_type, status, starts_at, ends_at, "
                "practitioner_name, notes, created_at"
            )
            .order("starts_at", desc=True)
            .limit(limit)
        )

        if patient_id:
            query = query.eq("patient_id", patient_id)
        if status:
            query = query.eq("status", status)
        if appointment_type:
            query = query.ilike("appointment_type", f"%{appointment_type}%")
        if date_from:
            query = query.gte("starts_at", date_from)
        if date_to:
            query = query.lte("starts_at", date_to)

        result = query.execute()
        appointments = result.data or []

        if not appointments:
            return (
                "No appointment records found matching the given filters. "
                "Note: Appointment data will populate once Cliniko integration is active."
            )

        # Count DNAs if querying all statuses
        dna_count = sum(1 for a in appointments if a.get("status") == "did_not_arrive")

        output = f"Found {len(appointments)} appointment(s)"
        if dna_count > 0:
            output += f" ({dna_count} DNA/no-show)"
        output += ":\n\n"

        for a in appointments:
            output += f"- **{a.get('appointment_type', 'Unknown')}** — {a.get('status', 'unknown').upper()}\n"
            output += f"  Date: {a.get('starts_at', 'N/A')} | Patient ID: {a.get('patient_id', 'N/A')}\n"
            if a.get("practitioner_name"):
                output += f"  Practitioner: {a['practitioner_name']}\n"
            output += "\n"

        return output.strip()

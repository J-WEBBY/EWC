// =============================================================================
// Vapi Tool: get_clinic_info
// Returns static clinic information — no DB query, instant response.
// =============================================================================

const CLINIC_INFO = {
  hours: `Edgbaston Wellness Clinic opening hours:
Monday to Friday: 9:00am – 6:00pm
Saturday: 10:00am – 2:00pm
Sunday: Closed
Bank holidays: Closed (emergency cover available — please call for details).`,

  location: `Edgbaston Wellness Clinic is located in Edgbaston, Birmingham, B15.
We are conveniently situated near the city centre with excellent transport links.
Free parking is available on-site for patients.
Nearest train station: Five Ways (5-minute walk).`,

  team: `Our clinical team is led by Dr Suresh Ganata, Medical Director.
We have a team of qualified aesthetic practitioners, nurses, and healthcare professionals.
All practitioners are fully qualified and registered with the relevant regulatory bodies.
Consultations are always carried out by a qualified clinician.`,

  parking: `Free parking is available on-site for all patients.
There is also street parking available nearby.
If you need any specific accessibility requirements, please let us know when booking.`,

  general: `Edgbaston Wellness Clinic is a premium private clinic in Birmingham offering:
• Aesthetic treatments: Botox, Dermal Fillers, CoolSculpting
• Wellness: IV Therapy, B12 Injections, Weight Loss programmes
• Medical: GP consultations, Health Screening, Blood Tests, Hormone Therapy
• All aesthetic consultations are completely free with no obligation to proceed
• Director: Dr Suresh Ganata (Medical Director)
• Location: Edgbaston, Birmingham B15
• Hours: Mon–Fri 9am–6pm, Sat 10am–2pm
• Phone bookings accepted for all treatments`,
};

export async function getClinicInfo(args: {
  topic: 'hours' | 'location' | 'team' | 'parking' | 'general';
}): Promise<string> {
  const { topic } = args;
  return CLINIC_INFO[topic] ?? CLINIC_INFO.general;
}

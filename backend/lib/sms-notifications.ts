import { sendSMS } from "./sms-service";

export async function sendNewApplicationSMS(
  type: string,
  fullName: string,
  email: string,
  phone: string
): Promise<void> {
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
  const timeET = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  });

  const message = `IVX NEW ${typeLabel.toUpperCase()} APPLICATION\n\n${fullName}\n${email}\n${phone}\n\nTime: ${timeET} ET\n\nReview in Admin > Applications`;

  console.log(`[SMS-Notify] Sending new ${type} application alert for: ${fullName}`);
  await sendSMS(message, "emergency");
}

export async function sendNewRegistrationSMS(
  firstName: string,
  lastName: string,
  email: string,
  country: string,
  role: string
): Promise<void> {
  const timeET = new Date().toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
  });

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const message = `IVX NEW REGISTRATION\n\n${firstName} ${lastName}\n${email}\nCountry: ${country}\nRole: ${roleLabel}\n\nTime: ${timeET} ET`;

  console.log(`[SMS-Notify] Sending new registration alert for: ${firstName} ${lastName}`);
  await sendSMS(message, "emergency");
}

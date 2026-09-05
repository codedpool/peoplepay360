// Auto-suggests login credentials when an Admin creates an Employee, since a
// freshly created Employee has no way to sign in otherwise (Employee and User
// are separate models — see backend/src/routes/users.routes.js). Suggestions
// are always editable before submit; nothing here is the source of truth.

export const COMPANY_EMAIL_DOMAIN = process.env.NEXT_PUBLIC_COMPANY_EMAIL_DOMAIN || "peoplepay360.dev";

function slug(part) {
  return part.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// firstname.lastname@domain, deduped against existingEmails by appending 2, 3, …
// Takes first/last name separately rather than splitting one combined string,
// so a multi-word or hyphenated name (e.g. first "Mary Jane", last "Smith-Jones")
// doesn't get mis-split.
export function suggestEmail(firstName, lastName, existingEmails, domain = COMPANY_EMAIL_DOMAIN) {
  const first = slug(firstName ?? "");
  const last = slug(lastName ?? "");
  const base = first && last ? `${first}.${last}` : first || last;
  if (!base) return "";

  let candidate = `${base}@${domain}`;
  let n = 2;
  while (existingEmails.has(candidate)) {
    candidate = `${base}${n}@${domain}`;
    n += 1;
  }
  return candidate;
}

const PASSWORD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";

export function generatePassword(length = 12) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => PASSWORD_CHARS[v % PASSWORD_CHARS.length]).join("");
}

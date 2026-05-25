// Placeholder for outbound notifications. Today this just logs to
// stdout so the operator can copy a password-reset link out of the
// container logs (or the password_reset_tokens collection). When email
// is wired up later, swap the body of `sendPasswordResetEmail` for a
// real provider call — no other code needs to change.

export type PasswordResetMail = {
  username: string;
  userId: string;
  link: string;
};

export async function sendPasswordResetEmail(mail: PasswordResetMail): Promise<void> {
  // Logged at info level so it shows in normal prod logs. Includes
  // the username for human-readability; userId is in the DB row.
  console.log(`[roomflix] password reset for @${mail.username}: ${mail.link}`);
}

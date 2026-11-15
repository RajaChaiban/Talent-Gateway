type InvitationMessage = { subject: string; text: string };

/**
 * The invitation email, built from the candidate's name and the job title
 * only: no score, no ranking and no link into the app. The send step and the
 * candidate detail both call this, so what the page shows is what was sent.
 */
export function invitationMessage(candidateName: string, jobTitle: string): InvitationMessage {
  const name = candidateName.trim();
  const title = jobTitle.trim();
  return {
    subject: `Interview invitation: ${title}`,
    text: [
      name ? `Hello ${name},` : "Hello,",
      `Thank you for applying for the ${title} role.`,
      "A recruiter has reviewed your application and would like to invite you to an interview.",
      "The recruiter will follow up with you shortly to arrange a time.",
      "Kind regards,\nThe hiring team",
    ].join("\n\n"),
  };
}

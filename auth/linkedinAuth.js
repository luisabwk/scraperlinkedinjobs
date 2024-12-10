async function getVerificationCodeFromEmail() {
  const config = {
    imap: {
      user: process.env.EMAIL_USER,
      password: process.env.EMAIL_PASSWORD,
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 993,
      tls: true,
      authTimeout: 3000,
      tlsOptions: { rejectUnauthorized: false }
    }
  };

  try {
    console.log("[AUTH] Connecting to email server...");
    const connection = await imap.connect(config);
    await connection.openBox("INBOX");

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      console.log(`[AUTH] Searching for verification email (attempt ${attempts + 1}/${maxAttempts})`);
      
      const searchCriteria = [
        ["UNSEEN"],
        ["FROM", "security-noreply@linkedin.com"],
        ["SUBJECT", "Aqui está seu código de verificação"],
        ["SINCE", new Date(Date.now() - 1000 * 60 * 5)]
      ];
      
      const fetchOptions = { bodies: ["HEADER.FIELDS (SUBJECT)", "TEXT"], markSeen: true };
      const messages = await connection.search(searchCriteria, fetchOptions);

      for (const message of messages) {
        const subject = message.parts.find(part => part.which === "HEADER.FIELDS (SUBJECT)");
        const body = message.parts.find(part => part.which === "TEXT");

        if (subject && body) {
          const verificationCode = body.body.match(/\b\d{6}\b/);
          if (verificationCode) {
            connection.end();
            return verificationCode[0];
          }
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        await delay(10000); // Wait 10 seconds before next attempt
      }
    }

    connection.end();
    throw new Error("Verification code not found after maximum attempts");
  } catch (error) {
    throw new Error(`Failed to get verification code: ${error.message}`);
  }
}

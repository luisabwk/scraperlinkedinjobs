const getVerificationCodeFromEmail = async (emailConfig) => {
  const config = {
    imap: {
      user: emailConfig.email,
      password: emailConfig.appPassword,
      host: emailConfig.host || "imap.gmail.com",
      port: emailConfig.port || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 30000,
      keepalive: true
    }
  };

  try {
    const connection = await imap.connect(config);
    await connection.openBox("INBOX");
    console.log("[EMAIL] Connected to inbox successfully");
    
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      console.log(`[EMAIL] Attempt ${attempts + 1}/${maxAttempts}`);
      
      const searchCriteria = [
        ["SUBJECT", "código de verificação"]
      ];
      
      const fetchOptions = { 
        bodies: ["HEADER.FIELDS (FROM SUBJECT)", "TEXT"],
        markSeen: true  // Changed to true to mark as read
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      console.log(`[EMAIL] Found ${messages.length} messages`);

      for (const message of messages) {
        const header = message.parts.find(part => part.which === "HEADER.FIELDS (FROM SUBJECT)");
        console.log("[EMAIL] Message headers:", header?.body);
        
        if (header?.body?.from?.[0]?.includes("linkedin.com")) {
          console.log("[EMAIL] Found LinkedIn email:", header.body);
          const subject = header?.body?.subject?.[0];
          const codeMatch = subject?.match(/\d{6}/);
          if (codeMatch) {
            console.log("[EMAIL] Code found:", codeMatch[0]);
            await connection.addFlags(message.attributes.uid, '\\Seen');
            await connection.end();
            return codeMatch[0];
          }
        }
      }

      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    await connection.end();
    throw new Error("Code not found");
  } catch (error) {
    console.error("[EMAIL] Error:", error);
    throw new Error(`Email verification failed: ${error.message}`);
  }
};

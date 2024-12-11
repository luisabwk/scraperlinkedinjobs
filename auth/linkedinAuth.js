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
    console.log("[EMAIL] Connecting with:", {
      user: config.imap.user,
      host: config.imap.host,
      port: config.imap.port
    });

    const connection = await imap.connect(config);
    await connection.openBox("INBOX");
    console.log("[EMAIL] Connected to inbox successfully");
    
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      console.log(`[EMAIL] Attempt ${attempts + 1}/${maxAttempts}`);
      
      // Search all messages from the last 5 minutes
      const searchCriteria = [
        ["SINCE", new Date(Date.now() - 1000 * 60 * 5)]
      ];
      
      const fetchOptions = { 
        bodies: ["HEADER.FIELDS (FROM SUBJECT)", "TEXT"],
        markSeen: false
      };

      const messages = await connection.search(searchCriteria, fetchOptions);
      console.log(`[EMAIL] Found ${messages.length} recent messages`);

      for (const message of messages) {
        const header = message.parts.find(part => part.which === "HEADER.FIELDS (FROM SUBJECT)");
        const from = header?.body?.from?.[0] || "";
        const subject = header?.body?.subject?.[0] || "";
        
        console.log(`[EMAIL] Processing - From: ${from}, Subject: ${subject}`);
        
        if (from.includes("linkedin.com") && subject.includes("verificação")) {
          const codeMatch = subject.match(/\d{6}/);
          if (codeMatch) {
            console.log("[EMAIL] Code found:", codeMatch[0]);
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

const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const imap = require("imap-simple");
const fs = require("fs"); // For saving screenshots
const path = require("path");
const nodemailer = require("nodemailer"); // For sending emails
const { ProxyAgent } = require('undici'); // For testing proxy
const crypto = require("crypto"); // For encrypting credentials

puppeteerExtra.use(StealthPlugin());

// Encryption Utility
const encrypt = (text) => {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync("encryption-key", "salt", 32); // Replace "encryption-key" with your secure key
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
};

const decrypt = (encryptedText) => {
  const algorithm = "aes-256-cbc";
  const key = crypto.scryptSync("encryption-key", "salt", 32); // Replace "encryption-key" with your secure key
  const [iv, encrypted] = encryptedText.split(":").map(part => Buffer.from(part, "hex"));
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
};

const sendEmailWithScreenshot = async (screenshotPath, recipientEmail, emailConfig) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailConfig.email,
      pass: emailConfig.appPassword,
    },
  });

  const mailOptions = {
    from: emailConfig.email,
    to: recipientEmail,
    subject: "LinkedIn Automation Error Screenshot",
    text: "An error occurred during LinkedIn automation. Please find the screenshot attached.",
    attachments: [
      {
        filename: "screenshot_error.png",
        path: screenshotPath,
      },
    ],
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("[EMAIL] Screenshot sent successfully to", recipientEmail);
  } catch (

import crypto from "crypto";

/** Invalidates sessions after server restart (unless persistAcrossRestarts). */
export const SESSION_BOOT_ID = crypto.randomBytes(8).toString("hex");

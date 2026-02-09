import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Express } from "express";

// Environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const CALLBACK_URL = process.env.CALLBACK_URL || "/auth/google/callback";
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim())
  .filter((e) => e.length > 0); // Filter out empty strings

// Startup logging
console.log("[AUTH] Configuration:");
console.log(
  `  - Client ID: ${GOOGLE_CLIENT_ID ? GOOGLE_CLIENT_ID.substring(0, 20) + "..." : "NOT SET"}`,
);
console.log(
  `  - Client Secret: ${GOOGLE_CLIENT_SECRET ? "SET (hidden)" : "NOT SET"}`,
);
console.log(`  - Callback URL: ${CALLBACK_URL}`);
console.log(
  `  - Allowed Emails: ${ALLOWED_EMAILS.length > 0 ? ALLOWED_EMAILS.join(", ") : "ALL"}`,
);

interface UserProfile {
  id: string;
  displayName: string;
  emails: { value: string }[];
  photos?: { value: string }[];
}

export function setupAuth(app: Express) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn(
      "[AUTH] Google Client ID/Secret not provided. Auth will fail.",
    );
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: CALLBACK_URL,
        proxy: true,
      },
      (accessToken, refreshToken, profile, done) => {
        const email = profile.emails?.[0]?.value;

        if (!email) {
          return done(new Error("No email found in Google profile"), undefined);
        }

        console.log(`[AUTH] Login attempt from: ${email}`);

        if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email)) {
          console.warn(
            `[AUTH] Blocked login attempt from unauthorized email: ${email}`,
          );
          return done(null, false, { message: "Unauthorized email" });
        }

        console.log(`[AUTH] Login approved for: ${email}`);

        const user: UserProfile = {
          id: profile.id,
          displayName: profile.displayName,
          emails: profile.emails || [],
          photos: profile.photos,
        };

        return done(null, user);
      },
    ),
  );

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((obj: any, done) => {
    done(null, obj);
  });

  app.use(passport.initialize());
  app.use(passport.session());
}

export function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

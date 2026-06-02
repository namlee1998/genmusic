```diff
diff --git a/src/auth/googleAuth.js b/src/auth/googleAuth.js
new file mode 100644
--- /dev/null
+++ b/src/auth/googleAuth.js
@@
+const { OAuth2Client } = require('google-auth-library');
+const { findUserByEmail, createUser, updateUserProfile } = require('../models/User');
+const { issueSessionToken } = require('./session');
+
+const client = new OAuth2Client({
+  clientId: process.env.GOOGLE_CLIENT_ID,
+  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
+  redirectUri: process.env.GOOGLE_REDIRECT_URI,
+});
+
+async function verifyGoogleToken(idToken) {
+  try {
+    const ticket = await client.verifyIdToken({
+      idToken,
+      audience: process.env.GOOGLE_CLIENT_ID,
+    });
+    return ticket.getPayload();
+  } catch (err) {
+    throw new Error('Invalid Google token');
+  }
+}
+
+async function findOrCreateGoogleUser(profile) {
+  const { email, name, picture } = profile;
+  let user = await findUserByEmail(email);
+  if (!user) {
+    user = await createUser({ email, name, avatar: picture, provider: 'google' });
+  } else {
+    user = await updateUserProfile(user.id, { name, avatar: picture });
+  }
+  return user;
+}
+
+module.exports = { client, verifyGoogleToken, findOrCreateGoogleUser };
diff --git a/src/routes/authGoogle.js b/src/routes/authGoogle.js
new file mode 100644
--- /dev/null
+++ b/src/routes/authGoogle.js
@@
+const express = require('express');
+const router = express.Router();
+const { client, verifyGoogleToken, findOrCreateGoogleUser } = require('../auth/googleAuth');
+const { issueSessionToken } = require('../auth/session');
+
+router.get('/google', (req, res) => {
+  const url = client.generateAuthUrl({
+    scope: ['openid', 'email', 'profile'],
+    state: req.session.csrfState,
+  });
+  res.redirect(url);
+});
+
+router.get('/google/callback', async (req, res) => {
+  try {
+    if (req.query.error || req.query.state !== req.session.csrfState) {
+      return res.redirect('/login?error=google_auth_failed');
+    }
+    const { tokens } = await client.getToken(req.query.code);
+    const profile = await verifyGoogleToken(tokens.id_token);
+    const user = await findOrCreateGoogleUser(profile);
+    const sessionToken = issueSessionToken(user);
+    res.cookie('session', sessionToken, { httpOnly: true, secure: true });
+    return res.redirect('/');
+  } catch (err) {
+    return res.redirect('/login?error=google_auth_failed');
+  }
+});
+
+module.exports = router;
diff --git a/tests/googleAuth.test.js b/tests/googleAuth.test.js
new file mode 100644
--- /dev/null
+++ b/tests/googleAuth.test.js
@@
+const { verifyGoogleToken, findOrCreateGoogleUser } = require('../src/auth/googleAuth');
+
+jest.mock('google-auth-library');
+
+describe('googleAuth', () => {
+  it('creates a new user when email does not exist', async () => {
+    const user = await findOrCreateGoogleUser({ email: 'new@gmail.com', name: 'New', picture: 'x' });
+    expect(user.email).toBe('new@gmail.com');
+    expect(user.provider).toBe('google');
+  });
+
+  it('throws on an invalid id token', async () => {
+    await expect(verifyGoogleToken('bad-token')).rejects.toThrow('Invalid Google token');
+  });
+});
diff --git a/frontend/src/components/GoogleSignInButton.tsx b/frontend/src/components/GoogleSignInButton.tsx
new file mode 100644
--- /dev/null
+++ b/frontend/src/components/GoogleSignInButton.tsx
@@
+export function GoogleSignInButton() {
+  const [loading, setLoading] = useState(false);
+  const onClick = () => {
+    setLoading(true);
+    window.location.href = '/api/v1/auth/google';
+  };
+  return (
+    <button aria-label="Sign in with Google" disabled={loading} onClick={onClick}>
+      {loading ? <Spinner /> : <GoogleIcon />} Sign in with Google
+    </button>
+  );
+}
```

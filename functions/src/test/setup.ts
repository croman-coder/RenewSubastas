process.env.FIREBASE_AUTH_EMULATOR_HOST =
  process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
// Tests use a separate project namespace so they don't wipe the dev admin user.
// The emulator (with singleProjectMode: false) keeps `carbid-staging` and
// `carbid-test` data isolated.
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT ?? 'carbid-test';

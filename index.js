// App entry point. The crash recorder is loaded before anything else so that
// even an error while the app starts up is saved and shown on the next launch.
import './src/services/crashLog';
import 'expo-router/entry';

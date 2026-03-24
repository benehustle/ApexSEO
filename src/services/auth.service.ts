import { signOut as firebaseSignOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';

export const authService = {
  async signIn(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password);
  },

  async signUp(email: string, password: string) {
    await createUserWithEmailAndPassword(auth, email, password);
  },

  async signOut() {
    await firebaseSignOut(auth);
  }
};

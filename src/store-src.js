// ชั้นเชื่อมต่อ Firebase: ล็อกอิน Google + เก็บข้อมูลแยกของแต่ละคนใน users/{uid}
import { initializeApp } from 'firebase/app';
import {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithRedirect, getRedirectResult, signOut, browserLocalPersistence, setPersistence,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, doc, collection, onSnapshot,
  setDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBUZlBLHBuaN8HjwczSWoXOpLdkjRzJ8b0',
  authDomain: 'slip-app-5e72f.firebaseapp.com',
  projectId: 'slip-app-5e72f',
  storageBucket: 'slip-app-5e72f.firebasestorage.app',
  messagingSenderId: '551293378576',
  appId: '1:551293378576:web:25307c9e4c44d81afeea95',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
let db;
try { db = initializeFirestore(app, { localCache: persistentLocalCache() }); }
catch (e) { db = initializeFirestore(app, {}); }
getRedirectResult(auth).catch(() => {});

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

window.Store = {
  onAuth(cb) {
    return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, name: u.displayName || '', email: u.email || '' } : null));
  },
  async signIn() {
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        await signInWithRedirect(auth, provider);
      } else if (e && e.code === 'auth/popup-closed-by-user') {
        return;
      } else { throw e; }
    }
  },
  signOut() { return signOut(auth); },
  subscribeProfile(uid, cb, err) {
    return onSnapshot(doc(db, 'users', uid), s => cb(s.exists() ? s.data() : {}), err);
  },
  saveProfile(uid, partial) {
    return setDoc(doc(db, 'users', uid), partial, { merge: true });
  },
  subscribeTx(uid, cb, err) {
    const q = query(collection(db, 'users', uid, 'tx'), orderBy('ts', 'desc'));
    return onSnapshot(q, s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), err);
  },
  saveTx(uid, id, body) {
    const ref = id ? doc(db, 'users', uid, 'tx', id) : doc(collection(db, 'users', uid, 'tx'));
    return setDoc(ref, body);
  },
  deleteTx(uid, id) { return deleteDoc(doc(db, 'users', uid, 'tx', id)); },
};
window.dispatchEvent(new Event('store-ready'));

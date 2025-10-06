import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

let db = null;
let initialized = false;

/**
 * Initialize Firebase
 */
export async function initFirebase() {
    if (!isFirebaseConfigured()) {
        console.warn('Firebase not configured. Using local storage only.');
        initialized = false;
        return false;
    }

    try {
        // Import Firebase modules
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getFirestore, collection, addDoc, doc, getDoc, getDocs, updateDoc, setDoc, increment } =
            await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        initialized = true;

        // Store Firestore functions globally for later use
        window.firestoreFunctions = { collection, addDoc, doc, getDoc, getDocs, updateDoc, setDoc, increment };

        console.log('Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('Error initializing Firebase:', error);
        initialized = false;
        return false;
    }
}

/**
 * Save a vote to Firebase
 */
export async function saveVote(userId, winnerId, loserId) {
    if (!initialized) return null;

    try {
        const { collection, addDoc } = window.firestoreFunctions;
        const voteRef = await addDoc(collection(db, 'votes'), {
            userId,
            winnerId,
            loserId,
            timestamp: Date.now()
        });
        return voteRef.id;
    } catch (error) {
        console.error('Error saving vote:', error);
        return null;
    }
}

/**
 * Update user stats
 */
export async function updateUserStats(userId, personalRatings) {
    if (!initialized) return;

    try {
        const { doc, setDoc } = window.firestoreFunctions;
        await setDoc(doc(db, 'userStats', userId), {
            personalRatings,
            lastUpdated: Date.now()
        });
    } catch (error) {
        console.error('Error updating user stats:', error);
    }
}

/**
 * Get user stats
 */
export async function getUserStats(userId) {
    if (!initialized) return null;

    try {
        const { doc, getDoc } = window.firestoreFunctions;
        const docRef = doc(db, 'userStats', userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error('Error getting user stats:', error);
        return null;
    }
}

/**
 * Update global ELO ratings
 */
export async function updateGlobalELO(winnerId, loserId, newWinnerRating, newLoserRating, userId) {
    if (!initialized) return;

    try {
        const { doc, setDoc, getDoc, increment } = window.firestoreFunctions;

        // Update global ratings
        const globalDocRef = doc(db, 'globalELO', 'ratings');
        const globalDoc = await getDoc(globalDocRef);

        const currentRatings = globalDoc.exists() ? globalDoc.data() : {};

        await setDoc(globalDocRef, {
            ...currentRatings,
            [winnerId]: newWinnerRating,
            [loserId]: newLoserRating,
            totalVotes: increment(1),
            lastUpdated: Date.now()
        }, { merge: true });

        // Track unique user in separate document to avoid race conditions
        const userDocRef = doc(db, 'uniqueUsers', userId);
        await setDoc(userDocRef, {
            firstVote: Date.now()
        }, { merge: true });
    } catch (error) {
        console.error('Error updating global ELO:', error);
    }
}

/**
 * Get global ELO ratings
 */
export async function getGlobalELO() {
    if (!initialized) return null;

    try {
        const { doc, getDoc } = window.firestoreFunctions;
        const docRef = doc(db, 'globalELO', 'ratings');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data();
        }
        return null;
    } catch (error) {
        console.error('Error getting global ELO:', error);
        return null;
    }
}

/**
 * Get count of unique users
 */
export async function getUniqueUserCount() {
    if (!initialized) return 0;

    try {
        const { collection, getDocs } = window.firestoreFunctions;
        const usersRef = collection(db, 'uniqueUsers');
        const querySnapshot = await getDocs(usersRef);
        return querySnapshot.size;
    } catch (error) {
        console.error('Error getting unique user count:', error);
        return 0;
    }
}

/**
 * Get all votes for a specific user
 */
export async function getUserVotes(userId) {
    if (!initialized) return [];

    try {
        const { collection, getDocs, query, where } = window.firestoreFunctions;
        const votesRef = collection(db, 'votes');
        const q = query(votesRef, where('userId', '==', userId));
        const querySnapshot = await getDocs(q);

        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error('Error getting user votes:', error);
        return [];
    }
}

export function isInitialized() {
    return initialized;
}

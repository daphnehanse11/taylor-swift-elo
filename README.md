# Taylor Swift Album ELO Rankings

**🔗 Live Site:** [https://daphnehanse11.github.io/taylor-swift-elo/](https://daphnehanse11.github.io/taylor-swift-elo/)

A web app that uses the ELO rating system to rank Taylor Swift albums based on head-to-head matchups. Vote on album pairs, see how you compare to the crowd, and explore both personal rankings and the global consensus!

## For Users

Just visit the site and start voting - no setup or login required! Share your ranking URL with friends.

## For Developers - Deployment Setup

### 1. Firebase Configuration (Required for multi-user rankings)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Firestore Database**:
   - Click "Firestore Database" in the left menu
   - Click "Create database"
   - Choose "Start in test mode" (we'll secure it later)
   - Select a region close to your users
4. Register a web app:
   - Click the gear icon → Project settings
   - Scroll down to "Your apps"
   - Click the web icon (`</>`)
   - Register app with a nickname
   - Copy the `firebaseConfig` object
5. Update `js/firebase-config.js`:
   ```javascript
   export const firebaseConfig = {
       apiKey: "your-api-key",
       authDomain: "your-project.firebaseapp.com",
       projectId: "your-project-id",
       storageBucket: "your-project.appspot.com",
       messagingSenderId: "123456789",
       appId: "your-app-id"
   };
   ```

### 2. Firestore Security Rules

In Firebase Console, go to Firestore Database → Rules and use:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow anyone to read global rankings
    match /globalELO/{document} {
      allow read: if true;
      allow write: if true; // You may want to restrict this in production
    }

    // Allow users to read/write their own stats
    match /userStats/{userId} {
      allow read: if true; // Allow viewing other users' rankings
      allow write: if true;
    }

    // Allow anyone to submit votes
    match /votes/{voteId} {
      allow read: if true;
      allow create: if true;
    }
  }
}
```

### 3. Deploy to GitHub Pages

1. Enable GitHub Pages in your repo:
   - Go to Settings → Pages
   - Under "Build and deployment", select "GitHub Actions"
2. Push your code to the `main` branch
3. The site will automatically deploy via GitHub Actions
4. Visit `https://yourusername.github.io/taylor-swift-elo/`

## Local Development

Simply open `index.html` in a browser, or use a local server:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server
```

Then visit `http://localhost:8000`

## How ELO Works

- Each album starts at 1500 ELO
- When you choose album A over album B:
  - Album A gains points
  - Album B loses points
- Upsets (lower-rated beats higher-rated) cause bigger rating changes
- K-factor of 32 controls how much ratings change per matchup

## Data Storage

**With Firebase:**
- Votes stored in `votes` collection
- Personal ratings in `userStats` collection
- Global consensus in `globalELO` document

**Without Firebase (fallback):**
- Personal ratings in localStorage
- Global ratings in localStorage (only reflects your votes)

## Customization

**Change albums**: Edit `js/data.js`

**Adjust ELO sensitivity**: Change `K_FACTOR` in `js/data.js` (higher = more volatile)

**Modify styling**: Edit `style.css`

## Tech Stack

- Vanilla JavaScript (ES6 modules)
- Firebase Firestore
- GitHub Pages
- No build process required!

## License

MIT

---

Made with 💜 for Swifties

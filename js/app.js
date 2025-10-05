import { albums, INITIAL_ELO } from './data.js';
import { updateRatings, getRankings } from './elo.js';
import {
    initFirebase,
    saveVote,
    updateUserStats,
    getUserStats,
    updateGlobalELO,
    getGlobalELO,
    isInitialized
} from './firebase-service.js';

// State
let userId = null; // Current viewer's ID (for voting)
let viewingUserId = null; // User whose rankings we're viewing
let currentMatchup = null;
let personalRatings = {}; // The ratings being displayed (might be viewer's or someone else's)
let myOwnRatings = {}; // Current viewer's ratings (for voting)
let globalRatings = {};
let voteCount = 0;
let totalGlobalVotes = 0;
let usedPairs = new Set();

/**
 * Initialize user ID from URL or generate new one
 */
function initUserId() {
    const params = new URLSearchParams(window.location.search);
    const urlUserId = params.get('user');
    const isSharedLink = !!urlUserId;

    // Always get or create the current viewer's ID
    userId = localStorage.getItem('tselo-userId');
    if (!userId) {
        userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('tselo-userId', userId);
    }

    // If viewing a shared link, set viewingUserId to the shared user
    // Otherwise, we're viewing our own rankings
    viewingUserId = urlUserId || userId;

    // Update share URL with current viewer's ID
    const shareUrl = `${window.location.origin}${window.location.pathname}?user=${userId}#my-rankings`;
    document.getElementById('share-url').value = shareUrl;

    return isSharedLink;
}

/**
 * Load user data from Firebase or localStorage
 */
async function loadUserData() {
    // Load the viewing user's data (for display on "My Rankings")
    if (isInitialized()) {
        const stats = await getUserStats(viewingUserId);
        if (stats && stats.personalRatings) {
            personalRatings = stats.personalRatings;
        }
    } else {
        // Load from localStorage
        const saved = localStorage.getItem('tselo-ratings-' + viewingUserId);
        if (saved) {
            personalRatings = JSON.parse(saved);
        }
    }

    // Initialize all albums with default rating if needed
    albums.forEach(album => {
        if (!personalRatings[album.id]) {
            personalRatings[album.id] = INITIAL_ELO;
        }
    });

    // Load current viewer's own ratings (for voting)
    if (isInitialized()) {
        const myStats = await getUserStats(userId);
        if (myStats && myStats.personalRatings) {
            myOwnRatings = myStats.personalRatings;
        }
    } else {
        const mySaved = localStorage.getItem('tselo-ratings-' + userId);
        if (mySaved) {
            myOwnRatings = JSON.parse(mySaved);
        }
    }

    // Initialize current viewer's albums
    albums.forEach(album => {
        if (!myOwnRatings[album.id]) {
            myOwnRatings[album.id] = INITIAL_ELO;
        }
    });

    // Load current viewer's vote count
    const savedVoteCount = localStorage.getItem('tselo-voteCount-' + userId);
    if (savedVoteCount) {
        voteCount = parseInt(savedVoteCount);
        document.getElementById('vote-count').textContent = voteCount;
    }
}

/**
 * Load global rankings
 */
async function loadGlobalRankings() {
    if (isInitialized()) {
        const data = await getGlobalELO();
        if (data) {
            const { totalVotes, lastUpdated, ...ratings } = data;
            globalRatings = ratings;
            totalGlobalVotes = totalVotes || 0;

            // Initialize missing albums
            albums.forEach(album => {
                if (!globalRatings[album.id]) {
                    globalRatings[album.id] = INITIAL_ELO;
                }
            });

            updateTotalVotesDisplay();
        }
    } else {
        // Load from localStorage
        const saved = localStorage.getItem('tselo-global-ratings');
        if (saved) {
            globalRatings = JSON.parse(saved);
        }
        const savedVotes = localStorage.getItem('tselo-total-votes');
        if (savedVotes) {
            totalGlobalVotes = parseInt(savedVotes);
        }
        updateTotalVotesDisplay();
    }

    // Initialize all albums with default rating if needed
    albums.forEach(album => {
        if (!globalRatings[album.id]) {
            globalRatings[album.id] = INITIAL_ELO;
        }
    });
}

/**
 * Update total votes display
 */
function updateTotalVotesDisplay() {
    document.getElementById('total-votes').textContent = totalGlobalVotes;
}

/**
 * Generate a random matchup
 */
function generateMatchup() {
    // Reset used pairs if we've exhausted all combinations
    const totalPairs = (albums.length * (albums.length - 1)) / 2;
    if (usedPairs.size >= totalPairs) {
        usedPairs.clear();
    }

    let albumA, albumB, pairKey;
    do {
        const indexA = Math.floor(Math.random() * albums.length);
        let indexB = Math.floor(Math.random() * albums.length);

        while (indexB === indexA) {
            indexB = Math.floor(Math.random() * albums.length);
        }

        albumA = albums[indexA];
        albumB = albums[indexB];

        // Create consistent pair key (sorted to avoid A-B vs B-A duplicates)
        pairKey = [albumA.id, albumB.id].sort().join('-');
    } while (usedPairs.has(pairKey));

    usedPairs.add(pairKey);
    currentMatchup = { albumA, albumB };

    displayMatchup();
}

/**
 * Display current matchup
 */
function displayMatchup() {
    if (!currentMatchup) return;

    const { albumA, albumB } = currentMatchup;

    document.getElementById('album-a-img').src = albumA.image;
    document.getElementById('album-a-img').alt = albumA.name;
    document.getElementById('album-a-name').textContent = albumA.name;

    document.getElementById('album-b-img').src = albumB.image;
    document.getElementById('album-b-img').alt = albumB.name;
    document.getElementById('album-b-name').textContent = albumB.name;
}

/**
 * Handle vote
 */
async function handleVote(choice) {
    if (!currentMatchup) return;

    const { albumA, albumB } = currentMatchup;
    const winner = choice === 'a' ? albumA : albumB;
    const loser = choice === 'a' ? albumB : albumA;

    // Update viewer's own ratings
    myOwnRatings = updateRatings(myOwnRatings, winner.id, loser.id);

    // If viewing our own rankings, update displayed ratings
    if (viewingUserId === userId) {
        personalRatings = myOwnRatings;
    }

    // Update global ratings
    globalRatings = updateRatings(globalRatings, winner.id, loser.id);

    // Increment vote counts
    voteCount++;
    totalGlobalVotes++;
    document.getElementById('vote-count').textContent = voteCount;
    localStorage.setItem('tselo-voteCount-' + userId, voteCount);
    updateTotalVotesDisplay();

    // Save to Firebase or localStorage
    if (isInitialized()) {
        await saveVote(userId, winner.id, loser.id);
        await updateUserStats(userId, myOwnRatings);
        await updateGlobalELO(winner.id, loser.id, globalRatings[winner.id], globalRatings[loser.id]);

        // Reload global data to get updated vote count
        await loadGlobalRankings();
    } else {
        // Save to localStorage
        localStorage.setItem('tselo-ratings-' + userId, JSON.stringify(myOwnRatings));
        localStorage.setItem('tselo-global-ratings', JSON.stringify(globalRatings));
        localStorage.setItem('tselo-total-votes', totalGlobalVotes.toString());
    }

    // Show vote result inline
    showVoteResult(albumA, albumB);

    // Disable vote buttons and show next button
    document.querySelectorAll('.vote-btn').forEach(btn => btn.disabled = true);
    document.getElementById('next-matchup-btn-container').classList.remove('hidden');
}

/**
 * Show vote result with global rankings
 */
function showVoteResult(albumA, albumB) {
    const rankings = getRankings(globalRatings, albums);
    const albumARank = rankings.findIndex(a => a.id === albumA.id) + 1;
    const albumBRank = rankings.findIndex(a => a.id === albumB.id) + 1;

    const rankA = document.getElementById('rank-a');
    const rankB = document.getElementById('rank-b');

    // Update content
    rankA.textContent = `Global Rank: #${albumARank}`;
    rankB.textContent = `Global Rank: #${albumBRank}`;

    // Show ranks
    rankA.classList.remove('hidden');
    rankB.classList.remove('hidden');

    // Apply color coding (higher rank = lower number = better)
    if (albumARank < albumBRank) {
        rankA.classList.add('higher');
        rankA.classList.remove('lower');
        rankB.classList.add('lower');
        rankB.classList.remove('higher');
    } else {
        rankB.classList.add('higher');
        rankB.classList.remove('lower');
        rankA.classList.add('lower');
        rankA.classList.remove('higher');
    }
}

/**
 * Display personal rankings
 */
function displayPersonalRankings() {
    const rankings = getRankings(personalRatings, albums);
    const container = document.getElementById('personal-rankings');

    // Check if any rankings exist (all albums at 1500 = no votes)
    const hasRankings = rankings.some(r => r.rating !== INITIAL_ELO);

    if (!hasRankings) {
        const message = viewingUserId === userId
            ? 'Start voting to build your personal rankings!'
            : 'This user hasn\'t voted yet!';
        container.innerHTML = `<p style="text-align: center; color: #666; padding: 40px;">${message}</p>`;
        return;
    }

    // Split rankings into two columns
    const midpoint = Math.ceil(rankings.length / 2);
    const leftColumn = rankings.slice(0, midpoint);
    const rightColumn = rankings.slice(midpoint);

    container.innerHTML = `
        <div class="rankings-columns">
            <div class="rankings-column">
                ${leftColumn.map((album, index) => `
                    <div class="ranking-item-compact">
                        <div class="rank-compact">#${index + 1}</div>
                        <img src="${album.image}" alt="${album.name}">
                        <div class="album-info-compact">
                            <h3>${album.name}</h3>
                            <p class="elo-score">ELO: ${album.rating}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="rankings-column">
                ${rightColumn.map((album, index) => `
                    <div class="ranking-item-compact">
                        <div class="rank-compact">#${midpoint + index + 1}</div>
                        <img src="${album.image}" alt="${album.name}">
                        <div class="album-info-compact">
                            <h3>${album.name}</h3>
                            <p class="elo-score">ELO: ${album.rating}</p>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Display global rankings
 */
function displayGlobalRankings() {
    const rankings = getRankings(globalRatings, albums);
    const container = document.getElementById('global-rankings');

    container.innerHTML = rankings.map((album, index) => `
        <div class="ranking-item">
            <div class="rank">#${index + 1}</div>
            <img src="${album.image}" alt="${album.name}">
            <div class="album-info">
                <h3>${album.name}</h3>
                <p class="elo-score">ELO: ${album.rating}</p>
            </div>
        </div>
    `).join('');
}

/**
 * Setup tab switching
 */
function setupTabs(isSharedLink) {
    const tabs = {
        'vote-tab': 'vote-section',
        'my-rankings-tab': 'my-rankings-section',
        'global-rankings-tab': 'global-rankings-section'
    };

    const hashToTab = {
        '#vote': 'vote-tab',
        '#my-rankings': 'my-rankings-tab',
        '#global-rankings': 'global-rankings-tab'
    };

    const tabToHash = {
        'vote-tab': '#vote',
        'my-rankings-tab': '#my-rankings',
        'global-rankings-tab': '#global-rankings'
    };

    // Determine initial tab
    let initialTab;
    const hash = window.location.hash;

    if (hash && hashToTab[hash]) {
        initialTab = hashToTab[hash];
    } else if (isSharedLink) {
        initialTab = 'my-rankings-tab';
        window.location.hash = '#my-rankings';
    } else {
        initialTab = localStorage.getItem('tselo-active-tab') || 'vote-tab';
    }

    switchToTab(initialTab, tabs);

    // Handle hash changes
    window.addEventListener('hashchange', () => {
        const newHash = window.location.hash;
        if (hashToTab[newHash]) {
            switchToTab(hashToTab[newHash], tabs);
        }
    });

    // Handle tab clicks
    Object.keys(tabs).forEach(tabId => {
        document.getElementById(tabId).addEventListener('click', () => {
            window.location.hash = tabToHash[tabId];
            switchToTab(tabId, tabs);
            localStorage.setItem('tselo-active-tab', tabId);
        });
    });
}

/**
 * Switch to a specific tab
 */
function switchToTab(tabId, tabs) {
    // Update active tab
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');

    // Show corresponding section
    document.querySelectorAll('.section').forEach(section => section.classList.remove('active'));
    document.getElementById(tabs[tabId]).classList.add('active');

    // Refresh rankings if viewing them
    if (tabId === 'my-rankings-tab') {
        // Update title based on whose rankings we're viewing
        const title = viewingUserId === userId ? 'Your Personal Rankings' : 'Their Personal Rankings';
        document.getElementById('rankings-title').textContent = title;
        displayPersonalRankings();
    } else if (tabId === 'global-rankings-tab') {
        displayGlobalRankings();
    }
}

/**
 * Setup vote buttons
 */
function setupVoteButtons() {
    document.querySelectorAll('.vote-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const choice = e.target.dataset.choice;
            handleVote(choice);
        });
    });

    // Setup next matchup button
    document.getElementById('next-matchup-btn').addEventListener('click', () => {
        // Hide ranks and next button
        document.getElementById('rank-a').classList.add('hidden');
        document.getElementById('rank-b').classList.add('hidden');
        document.getElementById('next-matchup-btn-container').classList.add('hidden');

        // Re-enable vote buttons
        document.querySelectorAll('.vote-btn').forEach(btn => btn.disabled = false);

        // Generate next matchup
        generateMatchup();
    });
}

/**
 * Setup copy link button
 */
function setupCopyLink() {
    document.getElementById('copy-link').addEventListener('click', () => {
        const input = document.getElementById('share-url');
        const shareText = `💜 Check out my Taylor Swift album rankings! ${input.value}`;
        navigator.clipboard.writeText(shareText);

        const btn = document.getElementById('copy-link');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

/**
 * Initialize app
 */
async function init() {
    // Initialize Firebase
    await initFirebase();

    // Initialize user
    const isSharedLink = initUserId();

    // Load data
    await loadUserData();
    await loadGlobalRankings();

    // Setup UI
    setupTabs(isSharedLink);
    setupVoteButtons();
    setupCopyLink();

    // Generate first matchup
    generateMatchup();

    console.log('App initialized');
}

// Start app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

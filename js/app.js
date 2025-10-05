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
let userId = null;
let currentMatchup = null;
let personalRatings = {};
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

    if (urlUserId) {
        userId = urlUserId;
        // Don't save shared user ID to localStorage
    } else {
        // Check localStorage
        userId = localStorage.getItem('tselo-userId');
        if (!userId) {
            // Generate new ID
            userId = 'user-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
            localStorage.setItem('tselo-userId', userId);
        }
    }

    // Update share URL
    const shareUrl = `${window.location.origin}${window.location.pathname}?user=${userId}#my-rankings`;
    document.getElementById('share-url').value = shareUrl;

    return isSharedLink;
}

/**
 * Load user data from Firebase or localStorage
 */
async function loadUserData() {
    if (isInitialized()) {
        const stats = await getUserStats(userId);
        if (stats && stats.personalRatings) {
            personalRatings = stats.personalRatings;
        }
    } else {
        // Load from localStorage
        const saved = localStorage.getItem('tselo-ratings-' + userId);
        if (saved) {
            personalRatings = JSON.parse(saved);
        }
    }

    // Load vote count from localStorage
    const savedVoteCount = localStorage.getItem('tselo-voteCount-' + userId);
    if (savedVoteCount) {
        voteCount = parseInt(savedVoteCount);
        document.getElementById('vote-count').textContent = voteCount;
    }

    // Initialize all albums with default rating if needed
    albums.forEach(album => {
        if (!personalRatings[album.id]) {
            personalRatings[album.id] = INITIAL_ELO;
        }
    });
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

    // Update personal ratings
    personalRatings = updateRatings(personalRatings, winner.id, loser.id);

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
        await updateUserStats(userId, personalRatings);
        await updateGlobalELO(winner.id, loser.id, globalRatings[winner.id], globalRatings[loser.id]);

        // Reload global data to get updated vote count
        await loadGlobalRankings();
    } else {
        // Save to localStorage
        localStorage.setItem('tselo-ratings-' + userId, JSON.stringify(personalRatings));
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

    if (voteCount === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">Start voting to build your personal rankings!</p>';
        return;
    }

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

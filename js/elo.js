import { K_FACTOR } from './data.js';

/**
 * Calculate expected score for a player
 * @param {number} playerRating - Current ELO rating of the player
 * @param {number} opponentRating - Current ELO rating of the opponent
 * @returns {number} Expected score (0 to 1)
 */
export function getExpectedScore(playerRating, opponentRating) {
    return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
}

/**
 * Calculate new ELO rating after a match
 * @param {number} currentRating - Current ELO rating
 * @param {number} opponentRating - Opponent's ELO rating
 * @param {number} actualScore - Actual score (1 for win, 0 for loss, 0.5 for draw)
 * @param {number} kFactor - K-factor (default 32)
 * @returns {number} New ELO rating
 */
export function calculateNewRating(currentRating, opponentRating, actualScore, kFactor = K_FACTOR) {
    const expectedScore = getExpectedScore(currentRating, opponentRating);
    return currentRating + kFactor * (actualScore - expectedScore);
}

/**
 * Update ratings for both albums after a matchup
 * @param {Object} ratings - Object containing current ratings for all albums
 * @param {string} winnerId - ID of the winning album
 * @param {string} loserId - ID of the losing album
 * @returns {Object} Updated ratings object
 */
export function updateRatings(ratings, winnerId, loserId) {
    const winnerRating = ratings[winnerId] || 1500;
    const loserRating = ratings[loserId] || 1500;

    const newWinnerRating = calculateNewRating(winnerRating, loserRating, 1);
    const newLoserRating = calculateNewRating(loserRating, winnerRating, 0);

    return {
        ...ratings,
        [winnerId]: Math.round(newWinnerRating),
        [loserId]: Math.round(newLoserRating)
    };
}

/**
 * Get sorted rankings from ratings object
 * @param {Object} ratings - Object containing ratings for all albums
 * @param {Array} albums - Array of album objects
 * @returns {Array} Sorted array of albums with their ratings
 */
export function getRankings(ratings, albums) {
    return albums
        .map(album => ({
            ...album,
            rating: ratings[album.id] || 1500
        }))
        .sort((a, b) => b.rating - a.rating);
}

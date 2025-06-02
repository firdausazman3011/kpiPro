const KPI = require('../models/KPI');

/**
 * Check if a KPI update is allowed based on its measurement frequency
 * @param {string} kpiId - The ID of the KPI
 * @param {string} measurementFrequency - The frequency of measurement (Daily, Weekly, Monthly, Quarterly, Yearly)
 * @returns {Promise<boolean>} - Returns true if update is allowed, false otherwise
 */
async function isUpdateAllowed(kpiId, measurementFrequency) {
    console.log('Validating update for KPI:', kpiId);
    console.log('Measurement frequency:', measurementFrequency);

    const kpi = await KPI.findById(kpiId);
    if (!kpi) {
        console.log('KPI not found');
        return false;
    }

    // If this is the first update (no historical data), allow it
    if (kpi.historicalData.length === 0) {
        console.log('First update - allowing');
        return true;
    }

    const now = new Date();
    const lastUpdate = new Date(kpi.historicalData[kpi.historicalData.length - 1].date);

    console.log('Current time:', now);
    console.log('Last update time:', lastUpdate);
    console.log('Historical data length:', kpi.historicalData.length);

    let canUpdate = false;
    switch (measurementFrequency) {
        case 'Daily':
            canUpdate = now.getDate() !== lastUpdate.getDate() ||
                   now.getMonth() !== lastUpdate.getMonth() ||
                   now.getFullYear() !== lastUpdate.getFullYear();
            console.log('Daily check - Can update:', canUpdate);
            break;

        case 'Weekly':
            const lastWeek = getWeekNumber(lastUpdate);
            const currentWeek = getWeekNumber(now);
            canUpdate = lastWeek !== currentWeek || 
                   lastUpdate.getFullYear() !== now.getFullYear();
            console.log('Weekly check - Last week:', lastWeek, 'Current week:', currentWeek);
            console.log('Weekly check - Can update:', canUpdate);
            break;

        case 'Monthly':
            canUpdate = now.getMonth() !== lastUpdate.getMonth() ||
                   now.getFullYear() !== lastUpdate.getFullYear();
            console.log('Monthly check - Can update:', canUpdate);
            break;

        case 'Quarterly':
            const lastQuarter = Math.floor(lastUpdate.getMonth() / 3);
            const currentQuarter = Math.floor(now.getMonth() / 3);
            canUpdate = lastQuarter !== currentQuarter ||
                   lastUpdate.getFullYear() !== now.getFullYear();
            console.log('Quarterly check - Last quarter:', lastQuarter, 'Current quarter:', currentQuarter);
            console.log('Quarterly check - Can update:', canUpdate);
            break;

        case 'Yearly':
            canUpdate = now.getFullYear() !== lastUpdate.getFullYear();
            console.log('Yearly check - Can update:', canUpdate);
            break;

        default:
            console.log('No frequency specified, allowing update');
            canUpdate = true;
    }

    return canUpdate;
}

/**
 * Get the week number of a date
 * @param {Date} date - The date to get the week number for
 * @returns {number} - The week number (1-52)
 */
function getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

module.exports = {
    isUpdateAllowed
}; 
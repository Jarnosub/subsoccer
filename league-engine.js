/**
 * PRO LEAGUES ENGINE
 * Used for managing large group-stage to playoffs tournaments.
 */

const LeagueEngine = {
    init: function() {
        console.log("League Engine initialized.");
    },
    
    // Shuffles an array randomly using Fisher-Yates
    shuffle: function(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    },
    
    // Divides an array of participants into groups. 
    // Takes the top (e.g. 8) and creates Group A, B, C...
    assignGroups: function(participants, maxPerGroup = 8) {
        if (!participants || participants.length === 0) return [];

        const shuffled = this.shuffle([...participants]);
        let groups = [];
        let groupLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        
        while (shuffled.length > 0) {
            groups.push(shuffled.splice(0, maxPerGroup));
        }
        
        // Returns structured group assignments
        return groups.map((g, index) => {
            return {
                groupName: 'Group ' + groupLetters[index],
                groupId: groupLetters[index],
                players: g
            };
        });
    }
};

window.LeagueEngine = LeagueEngine;

function parseLocation(locationStr) {
    if (!locationStr || locationStr === 'Unknown') {
        return { city: 'Unknown', countryCode: '', timezone: 'Unknown', raw: locationStr };
    }
    
    if (locationStr.includes('(') && locationStr.includes(')')) {
        const parenStart = locationStr.indexOf('(');
        const parenEnd = locationStr.indexOf(')');
        const timezone = locationStr.substring(parenStart + 1, parenEnd).trim();
        const mainPart = locationStr.substring(0, parenStart).trim();
        
        let city = mainPart;
        let countryCode = '';
        const commaIndex = mainPart.indexOf(',');
        if (commaIndex > -1) {
            city = mainPart.substring(0, commaIndex).trim();
            countryCode = mainPart.substring(commaIndex + 1).trim();
        }
        
        return {
            city: city.replace(/_/g, ' '),
            countryCode: countryCode,
            timezone: timezone,
            raw: locationStr
        };
    }
    
    const parts = locationStr.split('/');
    const city = parts.length > 1 ? parts[parts.length - 1].replace(/_/g, ' ') : locationStr;
    
    return {
        city: city,
        countryCode: '',
        timezone: locationStr,
        raw: locationStr
    };
}

const testCases = [
    "Espoo, FI (Europe/Helsinki)",
    "Europe/Espoo",
    "Asia/Jakarta",
    "Jakarta, ID (Asia/Jakarta)",
    "New York, US (America/New_York)",
    "America/New_York",
    "Unknown",
    null,
    undefined
];

console.log("Testing parseLocation helper:");
testCases.forEach(tc => {
    console.log(`\nInput: ${tc}`);
    console.log("Output:", parseLocation(tc));
});

exports.handler = async function(event, context) {
    const headers = event.headers || {};
    
    // Netlify adds these geo headers automatically to incoming requests
    const ip = headers['x-nf-client-connection-ip'] || '';
    const city = headers['x-city'] || '';
    const country = headers['x-country'] || '';
    const region = headers['x-region'] || '';
    const timezone = headers['x-timezone'] || '';

    // Netlify header strings are URL-encoded if they contain special characters (like Scandinavian letters)
    let decodedCity = city;
    try {
        if (city) {
            decodedCity = decodeURIComponent(escape(city)); 
        }
    } catch (e) {
        try {
            decodedCity = decodeURIComponent(city);
        } catch (err) {}
    }

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            ip: ip,
            city: decodedCity,
            country: country,
            region: region,
            timezone: timezone
        })
    };
};

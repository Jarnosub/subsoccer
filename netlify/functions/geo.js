exports.handler = async function(event, context) {
    const headers = event.headers || {};
    
    // Netlify adds these geo headers automatically to incoming requests
    const ip = headers['x-nf-client-connection-ip'] || '';
    let city = headers['x-city'] || '';
    let country = headers['x-country'] || '';
    let region = headers['x-region'] || '';
    let timezone = headers['x-timezone'] || '';
    let latitude = null;
    let longitude = null;

    // Decode x-nf-geo if present (Netlify passes geolocation data as a Base64-encoded JSON string)
    const geoHeader = headers['x-nf-geo'];
    if (geoHeader) {
        try {
            const geoData = JSON.parse(Buffer.from(geoHeader, 'base64').toString('utf-8'));
            if (geoData) {
                if (geoData.city) city = geoData.city;
                if (geoData.country) {
                    country = typeof geoData.country === 'object' ? geoData.country.code : geoData.country;
                }
                if (geoData.subdivision) {
                    region = typeof geoData.subdivision === 'object' ? geoData.subdivision.code : geoData.subdivision;
                }
                if (geoData.timezone) timezone = geoData.timezone;
                if (geoData.latitude) latitude = geoData.latitude;
                if (geoData.longitude) longitude = geoData.longitude;
            }
        } catch (e) {
            // Ignore parse errors, fall back to default headers
        }
    }

    // Netlify header strings are URL-encoded if they contain special characters (like Scandinavian letters)
    let decodedCity = city;
    try {
        if (city) {
            if (city.includes('%')) {
                decodedCity = decodeURIComponent(city);
            } else {
                try {
                    decodedCity = decodeURIComponent(escape(city)); 
                } catch (e) {
                    decodedCity = decodeURIComponent(city);
                }
            }
        }
    } catch (e) {
        decodedCity = city;
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
            timezone: timezone,
            latitude: latitude,
            longitude: longitude
        })
    };
};

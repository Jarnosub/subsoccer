exports.handler = async function() {
    return {
        statusCode: 200,
        body: JSON.stringify({
            openai_key: process.env.OPENAI_API_KEY,
            length: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
        })
    };
};

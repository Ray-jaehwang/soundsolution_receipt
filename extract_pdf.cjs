const fs = require('fs');
const pdf = require('pdf-parse/lib/pdf-parse.js');

let dataBuffer = fs.readFileSync('지출결의서_260127.pdf');

pdf(dataBuffer).then(function(data) {
    console.log(data.text);
}).catch(err => console.error(err));

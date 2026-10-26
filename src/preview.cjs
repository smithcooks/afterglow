const path=require('node:path');const {Store}=require('./model.cjs');const {createServer}=require('./server.cjs');
createServer({store:new Store(path.join(__dirname,'../.preview-data')),port:Number(process.env.AFTERGLOW_PORT)||4318}).then(({origin})=>console.log('Afterglow preview:',origin));

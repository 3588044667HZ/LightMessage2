const {Database} = require('./database')

const data = new Database();

data.initialize().then(r => {
    console.log('Initialized Database,r:', r);
});


data.createCollections()
// data.saveContact({id: 1, name: "LWR"})
console.log(data.getContacts())
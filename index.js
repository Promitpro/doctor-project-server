const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require("stripe")(process.env.SECTET_KEY)
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());



// const uri = `mongodb+srv://doctorPortal:f7OP9JC2OHcprFbE@cluster0.6ix5jrq.mongodb.net/?retryWrites=true&w=majority`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.6ix5jrq.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
function verifyJwt(req, res, next){
    // console.log('token inside verifyJwt', req.headers.authorization);
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send('unauthorized');
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, '198fa836786e312448cd6de7bed359e55b9fa6d961773d63381a1d895bab0b11f90f04765e9de0aa4cbb0488d8c9e26cf8585b5181cc823f27e8d082ca5fbae2', function(err, decoded){
        if(err){
            res.status(403).send({message: 'forbidden access'})
        }
        req.decoded = decoded;
        next();
    })
}
async function run () {
    try{
        const appointmentOptionCollection = client.db('doctorsPortal').collection('appointmentOptions');
        const bookingsCollection = client.db('doctorsPortal').collection('bookings');
        const usersCollection = client.db('doctorsPortal').collection('users');
        const doctorsCollection = client.db('doctorsPortal').collection('doctors');
        

        const verifyAdmin = async(req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = {email: decodedEmail};
            const user = await usersCollection.findOne(query);
            if(user?.role !== 'admin'){
                return res.status(403).send({message: 'Fodbidden Access'})
            }
            next();
        }

        app.get('/appointmentOptions', async(req, res) => {
            const date = req.query.date;
            const query = {};
            const options = await appointmentOptionCollection.find(query).toArray();
            const bookingQuery = {appointmentDate: date};
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
            options.forEach(option => {
                // console.log(option); ------> option shows all data of available options
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot)
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots;
                // console.log(date, option.name, remainingSlots.length);
            })
            res.send(options);
        })
        app.get('/appointmentSpeciality', async(req, res) => {
            const query = {};
            const result = await appointmentOptionCollection.find(query).project({name: 1}).toArray();
            res.send(result);
        })

        app.get('/bookings', verifyJwt, async(req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if(email !== decodedEmail){
                return res.status(403).send({message: 'forbidden access'})
            }
            // console.log('token', req.headers.authorization);
            const query = {email: email};
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        })
        
        app.post('/bookings', async(req, res) => {
            const booking = req.body;
            // console.log(booking);
            const query = {
                appointmentDate : booking.appointmentDate,
                treatment : booking.treatment,
                email : booking.email 
            }
            const alreadyBooked = await bookingsCollection.find(query).toArray();
            if(alreadyBooked.length)
            {
                const message = `You have already an appointment on ${booking.appointmentDate}`;
                return res.send({acknowledge: false, message})
            }
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })
        app.get('/bookings/:id', async(req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const bookings = await bookingsCollection.findOne(query);
            res.send(bookings);
        })
        
        app.get('/jwt', async(req, res) => {
            const email = req.query.email;
            const query = {email: email};
            const user = await usersCollection.findOne(query);
            if(user){
                const token = jwt.sign({email}, '198fa836786e312448cd6de7bed359e55b9fa6d961773d63381a1d895bab0b11f90f04765e9de0aa4cbb0488d8c9e26cf8585b5181cc823f27e8d082ca5fbae2' , {expiresIn: '1hr'});
                // console.log(token);
                return res.send({accessToken: token})
            }
            console.log(user);
            res.status(403).send({accessToken: ''});
        })
        app.get('/users', async(req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        })
        app.post('/users', async(req,res) => {
            const users = req.body;
            const result = await usersCollection.insertOne(users);
            res.send(result);
        })
        app.get('/users/admin/:email', async(req, res) => {
            const email = req.params.email;
            const query = {email};
            const user = await usersCollection.findOne(query);
            res.send({isAdmin: user?.role === 'admin'})
        })
        app.put('/users/admin/:id', verifyJwt, verifyAdmin ,async(req, res) => {
            
            const id = req.params.id;
            const filter = {_id: new ObjectId(id)};
            const options = {upsert: true};
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        })
        // app.get('/addPrice', async(req, res) => {
        //     const filter = {};
        //     const options= {upsert: true};
        //     const updateDoc = {
        //         $set:{
        //             price: 99
        //         }
        //     }
        //     const result = await appointmentOptionCollection.updateMany(filter, updateDoc, options);
        //     res.send(result);
        // })
        app.get('/doctors',verifyJwt,verifyAdmin, async(req,res)=>{
            const query = req.body;
            const result = await doctorsCollection.find(query).toArray();
            res.send(result);
        })
        app.post('/doctors',verifyJwt,verifyAdmin, async(req, res) => {
            const query = req.body;
            const doctors = await doctorsCollection.insertOne(query);
            res.send(doctors);
        })
        app.delete('/doctors/:id',verifyJwt,verifyAdmin, async(req, res) => {
            const id = req.params.id;
            const filter = {_id: new ObjectId(id)};
            const result = await doctorsCollection.deleteOne(filter);
            res.send(result);
        })
        app.post('/create-payment-intent', async(req, res) => {
            const booking = req.body;
            const price = booking.price;
            const amount = price*100;
            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                "payment_method_types": ["card"]
            })
            console.log(paymentIntent)
            res.send({clientSecret: paymentIntent.client_secret});
        })
    }
    finally{

    }
}
run().catch(console.log);

app.get('/', async(req, res) => {
    res.send('doctors portal server is running')
})

app.listen(port, () => {
    console.log(`Doctors portal server is running on ${port}`);
})




















// const paymentsCollection = client.db('doctorsPortal').collection('payments');


// app.post('/payments', async(req, res) => {
//     const payment = req.body;
//     const result = await paymentsCollection.insertOne(payment);
//     const id = payment.bookingId;
//     const filter = {_id: new ObjectId(id)};
//     const updatedDoc = {
//         $set : {
//             paid: true,
//             transectionId: payment.transectionId

//         }
//     }
//     const updatedResult = await bookingsCollection.updateOne(filter, updatedDoc);
//     res.send(result)
// })
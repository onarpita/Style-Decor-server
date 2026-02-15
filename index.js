require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require('firebase-admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const port = process.env.PORT || 3000;
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf-8');
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const app = express();
// middleware
app.use(cors());
app.use(express.json());

// jwt middlewares
const verifyJWT = async (req, res, next) => {
    const token = req?.headers?.authorization?.split(' ')[1];
    if (!token) return res.status(401).send({ message: 'Unauthorized Access!' });
    try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.tokenEmail = decoded.email;
        next();
    } catch (err) {
        return res.status(401).send({ message: 'Unauthorized Access!', err });
    }
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.MONGODB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});
async function run() {
    try {
        const db = client.db("style_decors_db");
        const usersCollection = db.collection("users");
        const servicesCollection = db.collection("services");
        const bookingsCollection = db.collection("bookings");
        const paymentsCollection = db.collection("payments");

        const verifyAdmin = async(req, res, next) => {
            const email = req.tokenEmail;
            const query = {email};
            const user = await usersCollection.findOne(query);
            if(!user || user.role !== "admin"){
                return res.status(403).send({message: "Forbidden access"});
            }
            next();
        }

        const verifyDecorator = async(req, res, next) => {
            const email = req.tokenEmail;
            const query = {email};
            const user = await usersCollection.findOne(query);
            if(!user || user.role !== "decorator"){
                return res.status(403).send({message: "Forbidden access"});
            }
            next();
        }

        
        // user apis
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const {limit = 0, skip = 0, role, work_status} = req.query;
            const adminEmail = req.tokenEmail;
            const query = {};
            query.email = {$ne: adminEmail};
            if(role) query.role = role;
            if(work_status) query.work_status = work_status;
            const result = await usersCollection.find(query).limit(Number(limit)).skip(Number(skip)).toArray();
            const count = await usersCollection.countDocuments(query);
            res.send({result, total: count});
        });

        app.get('/user/role', verifyJWT, async (req, res) => {
            const result = await usersCollection.findOne({ email: req.tokenEmail })
            res.send({ role: result?.role })
        })

        app.post("/users", async(req, res) => {
            const user = req.body;
            const query = {};
            user.role = "user";
            user.createdAt = new Date().toISOString();
            user.last_loggedIn = new Date().toISOString();
            if(user.email){
                query.email = user.email;
            }

            const userExists = await usersCollection.findOne(query);
            if(userExists){
                const updatedResult = await usersCollection.updateOne(query, {
                    $set: {
                        last_loggedIn: new Date().toISOString(),
                    },
                });
                return res.send(updatedResult);
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.patch("/user/:id/role", verifyJWT, verifyAdmin, async(req, res) => {
            const {id} = req.params;
            const {role} = req.body;
            const query = {_id: new ObjectId(id)};
            const updatedDoc = {
                $set: {
                    role: role,
                    work_status: "available"
                }
            };
            const result = await usersCollection.updateOne(query, updatedDoc);
            res.send(result);
        });

               // decorator apis
        app.get("/decorators", async(req, res) => {
            const query = {role: "decorator"};
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });
        
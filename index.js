const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config()
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rmr0fzr.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();


    const usersCollection = client.db("melody-master").collection("users");
    const classesCollection = client.db("melody-master").collection("classes");
    const selectedClassesCollection = client.db("melody-master").collection("selectedClasses");
    const paymentCollection = client.db("melody-master").collection("payment");
    const enrolledClassesCollection = client.db("melody-master").collection("enrolledClasses");

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }

    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'instructor') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }

    const verifyStudent = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'student') {
        return res.status(403).send({ error: true, message: 'forbidden message' });
      }
      next();
    }

    app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
      const newClass = req.body;
      const result = await classesCollection.insertOne(newClass);
      res.send(result);
    });

    app.get('/my-classes', verifyJWT, verifyInstructor, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }
      const query = { instructorEmail: email };
      const cursor = classesCollection.find(query);
      const classes = await cursor.toArray();
      res.send(classes);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const cursor = usersCollection.find({});
      const users = await cursor.toArray();
      res.send(users);
    });

    app.patch('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const {role} = req.body;
      const updateDoc = {
        $set: {
          role: role
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

      res.send({ token })
    })

    // checking student
    app.get('/users/student/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ student: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { student: user?.role === 'student' }
      res.send(result);
    })

    // checking instructor
    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'instructor' }
      res.send(result);
    })

    // checking admin
    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })

    app.get('/instructors', async (req, res) => {
      const query = { role: 'instructor' }
      const cursor = usersCollection.find(query);
      const instructors = await cursor.toArray();
      res.send(instructors);
    });

    app.get('/classes', async (req, res) => {
      const query = { status: 'approved' }
      const cursor = classesCollection.find(query);
      const classes = await cursor.toArray();
      res.send(classes);
    });

    app.get('/popular-classes', async (req, res) => {
      const query = { status: 'approved' }
      const cursor = classesCollection.find(query).sort({ totalEnrolled: -1 }).limit(6);
      const classes = await cursor.toArray();
      res.send(classes);
    });

    app.get('/all-classes', verifyJWT, verifyAdmin, async (req, res) => {
      const cursor = classesCollection.find({});
      const classes = await cursor.toArray();
      res.send(classes);
    });

    app.patch('/all-classes/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const { status } = req.body;
      const updateDoc = {
        $set: {
          status: status
        },
      };

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post('/selected-classes', verifyJWT, verifyStudent, async (req, res) => {
      const selectedClass = req.body;
      const result = await selectedClassesCollection.insertOne(selectedClass);
      res.send(result);
    });

    app.get('/selected-classes', verifyJWT, verifyStudent, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }
      const query = { email: email };
      const cursor = selectedClassesCollection.find(query);
      const classes = await cursor.toArray();
      res.send(classes);
    });

    app.get('/enrolled-classes', verifyJWT, verifyStudent, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }
      const query = { email: email };
      const cursor = enrolledClassesCollection.find(query);
      const classes = await cursor.toArray();
      res.send(classes);
    });

    app.delete('/selected-classes/:id', verifyJWT, verifyStudent, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectedClassesCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/selected-classes/:id', verifyJWT, verifyStudent, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const selectedClass = await selectedClassesCollection.findOne(query);
      res.send(selectedClass);
    });

    app.post("/create-payment-intent", verifyJWT, verifyStudent, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post('/payments', verifyJWT, verifyStudent, async (req, res) => {
      const payment = req.body;
      const { selectedClassId, classId } = payment;
      const insertResult = await paymentCollection.insertOne({ ...payment, date: new Date(payment.date) });

      const deleteQuery = { _id: new ObjectId(selectedClassId) };
      const deleteResult = await selectedClassesCollection.deleteOne(deleteQuery);

      const saveEnrolledClass = {
        email: req.decoded.email,
        classId: classId,
        name: payment.className,
        price: payment.price,
        image: payment.image,
        instructor: payment.instructor,
      }
      const enrolledClassResult = await enrolledClassesCollection.insertOne(saveEnrolledClass);

      // update class's available seats using $inc operator
      const updateQuery = { _id: new ObjectId(classId) };
      const updateClass = {
        $inc: { availableSeats: -1 },
        $inc: { totalEnrolled: 1}
      };
      const updateResult = await classesCollection.updateOne(updateQuery, updateClass);

      res.send({ insertResult, deleteResult, enrolledClassResult, updateResult });
    })

    app.get('/payments', verifyJWT, verifyStudent, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'forbidden access' })
      }
      const query = { email: email };
      const cursor = paymentCollection.find(query).sort({ date: -1 });
      const payments = await cursor.toArray();
      res.send(payments);
    });

    app.patch('/feedback/:id', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const { feedback } = req.body;
      const updateDoc = {
        $set: {
          feedBack: feedback
        },
      }

      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello from Melody Master');
})

app.listen(port, () => {
  console.log(`Melody Master server running on PORT ${port}`);
})

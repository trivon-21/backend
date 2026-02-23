const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

//no database
let acModels = [
    { id: 1, modelName: "LG 1.5T Inverter", capacity: "1.5 Ton", basePrice: 85000 },
    { id: 2, modelName: "Samsung 1T Split", capacity: "1 Ton", basePrice: 65000 },
    { id: 3, modelName: "Daikin 2T Premium", capacity: "2 Ton", basePrice: 120000 }
];

let quotations = [];
let quotationIdCounter = 1;

// 1️⃣ Get AC Models
app.get('/api/ac-models', (req, res) => {
    res.json(acModels);
});

// 2️⃣ Create Quotation
app.post('/api/quotations', (req, res) => {
    const { modelId, quantity } = req.body;

    const model = acModels.find(m => m.id === modelId);
    if (!model) {
        return res.status(404).json({ message: "AC Model not found" });
    }

    const taxRate = 0.1;
    const subtotal = model.basePrice * quantity;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    const newQuotation = {
        id: quotationIdCounter++,
        modelName: model.modelName,
        quantity,
        subtotal,
        tax,
        total,
        status: "Draft"
    };

    quotations.push(newQuotation);

    res.status(201).json(newQuotation);
});

// 3️⃣ Get All Quotations
app.get('/api/quotations', (req, res) => {
    res.json(quotations);
});

// 4️⃣ Accept Quotation
app.put('/api/quotations/:id/accept', (req, res) => {
    const quotation = quotations.find(q => q.id == req.params.id);

    if (!quotation) {
        return res.status(404).json({ message: "Quotation not found" });
    }

    quotation.status = "Accepted";
    res.json(quotation);
});

app.listen(5000, () => {
    console.log("Server running on port 5000");
});

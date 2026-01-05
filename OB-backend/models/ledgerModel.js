const mongoose = require("mongoose");

const ledgerSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },

    transactionAmount: {
      type: Number,
      required: true,
    },

    employee: {
      type: String,
      required: true,
    },

    remarks: {
      type: String,
      default: "",
    },

    balance: {
      type: Number,
      required: true,
    }
  },
  { timestamps: true }
);

const Ledger = mongoose.model("Ledger", ledgerSchema);
module.exports = Ledger;

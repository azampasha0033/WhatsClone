// middleware/requireActivePlanForClient.js
import mongoose from 'mongoose';
import { ClientModel } from '../db/clients.js';
import { Subscription } from '../models/Subscription.js';
import { Plan } from '../models/Plan.js';

function pickOwnerId(clientDoc) {
  return clientDoc.user_id || clientDoc.userId || clientDoc.ownerUserId || clientDoc.ownerId || null;
}

export async function requireActivePlanForClient(req, res, next) {
  try {
    const rawClientId =
      req.body.clientId || req.params.clientId || req.query.clientId;

    if (!rawClientId) {
      return res.status(400).json({ ok: false, code: 400, error: 'clientId is required' });
    }

    // Find client by _id or by clientId
    let client = null;
    if (mongoose.Types.ObjectId.isValid(rawClientId)) {
      client = await ClientModel.findById(rawClientId);
    }
    if (!client) client = await ClientModel.findOne({ clientId: rawClientId });
    if (!client) {
      return res.status(404).json({ ok: false, code: 404, error: 'Client not found' });
    }

    // Optional ownership check (keep if you enforce owners)
    const ownerId = pickOwnerId(client); // may be null if you don't store owners yet
    // If you want to REQUIRE owner linkage, keep this block. Otherwise, remove it.
    // if (!ownerId) {
    //   return res.status(400).json({
    //     ok: false,
    //     code: 400,
    //     error: 'This client is not linked to any owner user (missing userId/ownerId on Client)',
    //   });
    // }

    const now = new Date();

    // ✅ FIX 1: use startAt / endAt (not startsAt / endsAt)
    // ✅ FIX 2: match by the client's clientId (your subs are keyed by clientId)
    const sub = await Subscription.findOne({
      clientId: client.clientId,
      status: { $in: ['active', 'canceled'] }, // allow canceled but still within endAt
      startAt: { $lte: now },
      endAt:   { $gt:  now },
    }).sort({ endAt: -1 });

    if (!sub) {
      console.log('No Active subscription found for clientId: 1111 ', client.clientId);
      return res.status(402).json({ ok: false, code: 402, error: 'No active subscription for this client' });
    } 
    // else {
    //   console.log('Active subscription found for clientId:', client.clientId);
    // }

    const plan = await Plan.findOne({ code: sub.planCode });
    const limit = plan?.messageLimit ?? sub?.meta?.messageLimit ?? 0; // fallback to meta if needed
    const used  = sub?.usage?.messagesSentThisPeriod ?? 0;

    if (limit && used >= limit) {
      return res.status(402).json({ ok: false, code: 402, error: 'Message limit exceeded for this client' });
    }

    // Attach to request
    req.clientDoc = client;
    req.subscription = sub;
    req.plan = plan;
    req.subscriptionOwnerId = ownerId ?? null;

    next();
  } catch (err) {
    console.error('requireActivePlanForClient error:', err);
    res.status(500).json({ ok: false, code: 500, error: 'Server error' });
  }
}

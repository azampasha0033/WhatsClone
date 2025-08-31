import express from "express";
import { flowService } from "../services/flow.service.js";

const router = express.Router();

// Create flow
router.post("/", async (req, res) => {
  try {
    const { clientId, name, nodes, edges } = req.body;
    const flow = await flowService.createFlow(clientId, name, nodes, edges);
    res.json(flow);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all flows
router.get("/", async (req, res) => {
  const { clientId } = req.query;
  const flows = await flowService.getFlows(clientId);
  res.json(flows);
});

// Get single flow
router.get("/:flowId", async (req, res) => {
  const { clientId } = req.query;
  const flow = await flowService.getFlowById(clientId, req.params.flowId);
  res.json(flow);
});

// Update full flow
router.put("/:flowId", async (req, res) => {
  const { clientId, ...data } = req.body;
  const flow = await flowService.updateFlow(clientId, req.params.flowId, data);
  res.json(flow);
});

// Delete flow
router.delete("/:flowId", async (req, res) => {
  const { clientId } = req.query;
  await flowService.deleteFlow(clientId, req.params.flowId);
  res.json({ message: "Flow deleted" });
});

// Update only nodes
router.put("/:flowId/nodes", async (req, res) => {
  const { clientId, nodes } = req.body;
  const flow = await flowService.updateNodes(clientId, req.params.flowId, nodes);
  res.json(flow);
});

// Update only edges
router.put("/:flowId/edges", async (req, res) => {
  const { clientId, edges } = req.body;
  const flow = await flowService.updateEdges(clientId, req.params.flowId, edges);
  res.json(flow);
});

export default router;

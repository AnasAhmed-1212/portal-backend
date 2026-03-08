import Item from "../models/item.js";

/* ===========================
   CREATE ITEM
=========================== */
const createItem = async (req, res) => {
  try {
    const itemData = req.body;
    
    // For non-admin users, assign the item to their seller
    if (req.user.role !== "admin" && req.user.sellerId) {
      itemData.sellerId = req.user.sellerId._id;
    }
    
    const newItem = await Item.create(itemData);

    res.status(201).json({
      success: true,
      message: "Item created successfully",
      data: newItem,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/* ===========================
   GET ALL ITEMS
=========================== */
const getItems = async (req, res) => {
  try {
    let query = {};
    
    // For non-admin users, only show their seller's items
    if (req.user.role !== "admin" && req.user.sellerId) {
      query.sellerId = req.user.sellerId._id;
    }
    
    const items = await Item.find(query).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: items,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/* ===========================
   GET SINGLE ITEM
=========================== */
const getItemById = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    // Check access - non-admin users can only view their seller's items
    if (req.user.role !== "admin" && req.user.sellerId) {
      if (item.sellerId && item.sellerId.toString() !== req.user.sellerId._id.toString()) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only view your seller's items"
        });
      }
    }

    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/* ===========================
   UPDATE ITEM
=========================== */
const updateItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    // Check access - non-admin users can only update their seller's items
    if (req.user.role !== "admin" && req.user.sellerId) {
      if (item.sellerId && item.sellerId.toString() !== req.user.sellerId._id.toString()) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only update your seller's items"
        });
      }
    }

    const updatedItem = await Item.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Item updated successfully",
      data: updatedItem,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/* ===========================
   DELETE ITEM
=========================== */
const deleteItem = async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: "Item not found",
      });
    }

    // Check access - non-admin users can only delete their seller's items
    if (req.user.role !== "admin" && req.user.sellerId) {
      if (item.sellerId && item.sellerId.toString() !== req.user.sellerId._id.toString()) {
        return res.status(403).json({
          success: false,
          error: "Access denied - You can only delete your seller's items"
        });
      }
    }

    const deletedItem = await Item.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: "Item deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export { createItem, getItems, getItemById, updateItem, deleteItem };

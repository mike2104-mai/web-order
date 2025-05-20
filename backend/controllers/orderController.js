const { FoodOrder, TableOrder, Food, Table, User } = require("../models");
const sequelize = require("../config/database");
const { Op } = require("sequelize");

exports.createOrder = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const { tableId, customer, customerPhone, items } = req.body;

    if (!items || !items.length) {
      return res
        .status(400)
        .json({ message: "Order must contain at least one item" });
    }

    // Create table order first
    const tableOrder = await TableOrder.create(
      {
        tableId,
        customerName: customer,
        customerPhone,
        status: "pending",
      },
      { transaction: t }
    );

    // Create food orders
    const foodOrders = [];
    for (const item of items) {
      const { foodId, quantity } = item;

      // Check if food exists
      const food = await Food.findByPk(foodId);
      if (!food) {
        await t.rollback();
        return res
          .status(404)
          .json({ message: `Food with ID ${foodId} not found` });
      }

      // Calculate total price
      const totalPrice = (parseFloat(food.price) * quantity).toString();

      // Create food order
      const foodOrder = await FoodOrder.create(
        {
          tableOrderId: tableOrder.id,
          foodId,
          quantity,
          totalPrice,
        },
        { transaction: t }
      );

      foodOrders.push(foodOrder);
    }

    // Update table status
    if (tableId) {
      await Table.update(
        { status: "waiting" },
        { where: { id: tableId }, transaction: t }
      );
    }

    await t.commit();

    // Return the created order with all related data
    const returnOrder = await TableOrder.findOne({
      where: { id: tableOrder.id },
      include: [
        {
          model: FoodOrder,
          attributes: ["quantity", "totalPrice", "createdAt", "updatedAt"],
          include: [{ model: Food, attributes: ["name", "price", "image"] }],
        },
        { model: Table, attributes: ["id", "name", "status"] },
      ],
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: returnOrder,
    });
  } catch (error) {
    await t.rollback();
    console.error("Create order error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getOrderOfCustomer = async (req, res) => {
  try {
    const customerPhone = req.params.customerPhone;
    const returnOrder = await TableOrder.findOne({
      where: {
        customerPhone: customerPhone,
      },
      include: [
        {
          model: FoodOrder,
          attributes: ["quantity", "totalPrice"],
          include: [
            { model: Food, attributes: ["id", "name", "price", "image"] },
          ],
        },
        { model: Table, attributes: ["id", "name", "status"] },
      ],
      limit: 1,
      order: [["createdAt", "DESC"]],
    });

    if (!returnOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (returnOrder.status === "pending") {
      return res.status(200).json({
        success: true,
        message: "Order found",
        data: returnOrder,
      });
    }

    res.status(200).json({
      success: true,
      message: "Order completed",
      data: null,
    });
  } catch (err) {
    console.error("Get order of customer error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await TableOrder.findAll({
      include: [
        {
          model: FoodOrder,
          attributes: ["quantity", "totalPrice"],
          include: [
            { model: Food, attributes: ["id", "name", "price", "image"] },
          ],
        },
        { model: Table, attributes: ["id", "name", "status"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      message: "get all orders successfully",
      data: orders,
    });
  } catch (error) {
    console.error("Get all orders error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const orderId = req.params.id;

    const retunOrder = await TableOrder.findByPk(orderId, {
      include: [
        {
          model: FoodOrder,
          attributes: ["quantity", "totalPrice"],
          include: [{ model: Food, attributes: ["name", "price", "image"] }],
        },
        { model: Table, attributes: ["name", "status"] },
      ],
      limit: 1,
      order: [["createdAt", "DESC"]],
    });

    if (!retunOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({
      success: true,
      message: "Order found",
      data: retunOrder,
    });
  } catch (error) {
    console.error("Get order by ID error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getOrderByTableId = async (req, res) => {
  try {
    const tableId = req.params.tableId;
    const returnTable = await Table.findByPk(tableId, {
      attributes: ["name", "status"],
    });
    const retunOrder = await TableOrder.findOne({
      where: {
        tableId: tableId,
      },
      include: [
        {
          model: FoodOrder,
          attributes: ["quantity", "totalPrice"],
          include: [{ model: Food, attributes: ["name", "price", "image"] }],
        },
        { model: Table, attributes: ["name", "status"] },
      ],
      limit: 1,
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json({
      success: true,
      message: "fetch order and table successfully",
      data: {
        order: retunOrder,
        table: returnTable,
      },
    });
  } catch (error) {
    console.error("Get order by ID error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.updateOrder = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const orderId = req.params.id;
    const { status, items } = req.body;

    // Find the order
    const tableOrder = await TableOrder.findByPk(orderId, {
      include: [{ model: Table }],
    });

    if (items) {
      // Create food orders
      const foodOrders = [];
      for (const item of items) {
        const { id, price, quantity } = item;

        // Check if food order exists
        let foodOrder = await FoodOrder.findOne({
          where: {
            tableOrderId: tableOrder.id,
            foodId: id,
          },
        });

        if (foodOrder) {
          // Update existing food order
          const newQuantity = parseInt(foodOrder.quantity) + parseInt(quantity);
          const newTotalPrice = (parseFloat(price) * newQuantity).toString();

          await foodOrder.update(
            {
              quantity: newQuantity,
              totalPrice: newTotalPrice,
            },
            { transaction: t }
          );
        } else {
          const totalPrice = parseFloat(price) * quantity;
          // Create new food order
          foodOrder = await FoodOrder.create(
            {
              tableOrderId: tableOrder.id,
              foodId: id,
              quantity,
              totalPrice,
            },
            { transaction: t }
          );
        }
        foodOrders.push(foodOrder);
      }
    }

    if (!tableOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    //Cập nhật trạng thái đơn hàng thành
    await tableOrder.update({ status: status }, { transaction: t });
    // Cập nhật trạng thái bàn thành "empty"
    if (status === "completed") {
      await Table.update(
        { status: "empty" },
        { where: { id: tableOrder.Table.id }, transaction: t }
      );
    }
    // Return the created order with all related data
    const returnOrder = await TableOrder.findByPk(orderId, {
      include: [
        {
          model: FoodOrder,
          attributes: ["quantity", "totalPrice", "createdAt", "updatedAt"],
          include: [{ model: Food, attributes: ["name", "price", "image"] }],
        },
        { model: Table, attributes: ["id", "name", "status"] },
      ],
    });
    await t.commit();
    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: returnOrder,
    });
  } catch (error) {
    await t.rollback();
    console.error("Update order status error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.deleteOrder = async (req, res) => {
  const t = await sequelize.transaction();

  try {
    const orderId = req.params.id;

    // Find the food order
    const tableOrder = await TableOrder.findByPk(orderId, {});

    if (!tableOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    const table = await Table.findByPk(tableOrder.tableId, {});
    await table.update({ status: "empty" }, { transaction: t });

    // Delete food order
    await tableOrder.destroy({ transaction: t });

    await t.commit();

    res
      .status(200)
      .json({ success: true, message: "Order deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

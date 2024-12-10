// Import axios for HTTP requests
import axios from 'axios';

// Shopify store information and API access token
const SHOPIFY_STORE = process.env.SHOPIFY_SHOP_NAME;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// Function to check price and compare at price for products, and add result to order note attributes
async function addPriceCheckToOrderNotes() {
  try {
    // Step 1: Retrieve all orders
    const ordersResponse = await axios.get(
      `https://${SHOPIFY_STORE}/admin/api/2023-01/orders.json`,
      {
        headers: {
          'X-Shopify-Access-Token': ACCESS_TOKEN,
          'Content-Type': 'application/json',
        }
      }
    );

    const orders = ordersResponse.data.orders;

    // Step 2: Iterate over each order
    for (const order of orders) {
      let noteAttributes = [];

      // Step 3: For each line item, check product prices
      for (const lineItem of order.line_items) {
        const productId = lineItem.product_id;

        // Initialize value as "false" by default
        let hasComparePriceProduct = "false";

        try {
          // Fetch product details and check if any variant in the product has price and compare_at_price
          const productResponse = await axios.get(
            `https://${SHOPIFY_STORE}/admin/api/2023-01/products/${productId}.json`,
            {
              headers: {
                'X-Shopify-Access-Token': ACCESS_TOKEN,
                'Content-Type': 'application/json',
              }
            }
          );

          const productData = productResponse.data.product;
          // Check all variants within the product for price and compare_at_price
          hasComparePriceProduct = productData.variants.some(
            (variant) => variant.price && variant.compare_at_price
          ) ? "true" : "false";
        } catch (error) {
          console.error(`Error fetching details for product ${productId}:`, error.message);
        }

        // Step 4: Add the result of price checks to note attributes for this line item
        noteAttributes.push({
          name: `line_item_${lineItem.id}_has_compare_price_value_${hasComparePriceProduct}`,
          value: hasComparePriceProduct,
        });
      }

      // Step 5: Update the order's note attributes with the price check data
      const response = await axios.put(
        `https://${SHOPIFY_STORE}/admin/api/2023-01/orders/${order.id}.json`,
        {
          order: {
            id: order.id,
            note_attributes: noteAttributes,
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': ACCESS_TOKEN,
            'Content-Type': 'application/json',
          }
        }
      );

      console.log(`Price check data added to order ${order.id}:`, JSON.stringify(response.data, null, 2));
    }

    console.log("Price check data for products added to all orders.");
  } catch (error) {
    console.error('Error adding price check data to orders:', error.response ? error.response.data : error.message);
  }
}

// Execute the function to add price check data to order note attributes
addPriceCheckToOrderNotes();

import { test, expect } from '@playwright/test';

test.describe('3-Step Product Creation Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    await page.click('text=Products');
    await page.waitForSelector('[data-testid="product-list"]', { timeout: 10000 });
  });

  test('should complete full 3-step product creation workflow', async ({ page }) => {
    // Click Add Product button
    await page.click('button:has-text("Add Product")');
    
    // Verify Step 1 is active
    await expect(page.locator('text=Basic Details')).toBeVisible();
    await expect(page.locator('.MuiStepper-root')).toBeVisible();
    
    // Fill Step 1 - Basic Details
    await page.fill('input[label="Product Title *"]', 'Test 3-Step Product');
    await page.fill('input[label="SKU *"]', 'TSP-001');
    await page.fill('textarea[label="Product Description"]', 'Testing the new 3-step workflow');
    
    // Fill pricing fields including new cost_price
    await page.fill('input[label="Main Price *"]', '25.99');
    await page.fill('input[label="Strikethrough Price"]', '35.99');
    await page.fill('input[label="Cost Price"]', '12.50');
    
    // Fill inventory fields including new minimum_order_quantity
    await page.fill('input[label="Stock Quantity"]', '75');
    await page.fill('input[label="Minimum Order Quantity *"]', '2');
    
    // Proceed to Step 2
    await page.click('button:has-text("Next: Categorization")');
    
    // Verify Step 2 is active
    await expect(page.locator('text=Categorization & Settings')).toBeVisible();
    
    // Select mini-app type
    await page.click('div[label="Mini-APP Type *"]');
    await page.click('text=无人商店');
    
    // Wait for store selection to appear
    await page.waitForSelector('div[label="Store Location *"]', { timeout: 5000 });
    await page.click('div[label="Store Location *"]');
    
    // Select first available store
    const firstStore = page.locator('ul[role="listbox"] li').first();
    await firstStore.click();
    
    // Select category
    await page.waitForSelector('div[label="Category *"]', { timeout: 10000 });
    await page.click('div[label="Category *"]');
    const firstCategory = page.locator('ul[role="listbox"] li').first();
    await firstCategory.click();
    
    // Enable recommendations
    await page.check('input[type="checkbox"]:near(text="Mini-App Recommendation")');
    await page.check('input[type="checkbox"]:near(text="Featured Product")');
    
    // Create product and proceed to Step 3
    await page.click('button:has-text("Create Product & Continue")');
    
    // Wait for product creation success
    await page.waitForSelector('text=Product created successfully!', { timeout: 10000 });
    
    // Verify Step 3 is active
    await expect(page.locator('text=Image Management')).toBeVisible();
    
    // Test image upload functionality
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([{
      name: 'test-image.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data')
    }]);
    
    // Complete the workflow
    await page.click('button:has-text("Complete Product Creation")');
    
    // Verify final success
    await expect(page.locator('text=Product created successfully with all details!')).toBeVisible();
    
    // Verify modal closes
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('should validate step navigation and back button', async ({ page }) => {
    await page.click('button:has-text("Add Product")');
    
    // Fill Step 1 minimally
    await page.fill('input[label="Product Title *"]', 'Navigation Test');
    await page.fill('input[label="SKU *"]', 'NAV-001');
    await page.fill('input[label="Main Price *"]', '15.99');
    
    // Go to Step 2
    await page.click('button:has-text("Next: Categorization")');
    await expect(page.locator('text=Categorization & Settings')).toBeVisible();
    
    // Test Back button
    await page.click('button:has-text("Back")');
    await expect(page.locator('text=Basic Details')).toBeVisible();
    
    // Go forward again
    await page.click('button:has-text("Next: Categorization")');
    
    // Create product to reach Step 3
    await page.click('button:has-text("Create Product & Continue")');
    await page.waitForSelector('text=Product created successfully!', { timeout: 10000 });
    
    // Verify Step 3
    await expect(page.locator('text=Image Management')).toBeVisible();
    
    // Test Back from Step 3
    await page.click('button:has-text("Back")');
    await expect(page.locator('text=Categorization & Settings')).toBeVisible();
  });

  test('should validate required fields in each step', async ({ page }) => {
    await page.click('button:has-text("Add Product")');
    
    // Try to proceed without required fields
    await page.click('button:has-text("Next: Categorization")');
    await expect(page.locator('text=Please fill in all required fields')).toBeVisible();
    
    // Fill title only
    await page.fill('input[label="Product Title *"]', 'Validation Test');
    await page.click('button:has-text("Next: Categorization")');
    await expect(page.locator('text=Please fill in all required fields')).toBeVisible();
    
    // Fill SKU only
    await page.fill('input[label="SKU *"]', 'VAL-001');
    await page.click('button:has-text("Next: Categorization")');
    await expect(page.locator('text=Please fill in all required fields')).toBeVisible();
    
    // Fill price - should now proceed
    await page.fill('input[label="Main Price *"]', '10.99');
    await page.click('button:has-text("Next: Categorization")');
    await expect(page.locator('text=Categorization & Settings')).toBeVisible();
  });

  test('should validate minimum order quantity', async ({ page }) => {
    await page.click('button:has-text("Add Product")');
    
    // Fill required fields
    await page.fill('input[label="Product Title *"]', 'MOQ Test');
    await page.fill('input[label="SKU *"]', 'MOQ-001');
    await page.fill('input[label="Main Price *"]', '20.99');
    
    // Test invalid MOQ (0)
    await page.fill('input[label="Minimum Order Quantity *"]', '0');
    await page.click('button:has-text("Next: Categorization")');
    await expect(page.locator('text=Minimum order quantity must be at least 1')).toBeVisible();

    // Fix MOQ
    await page.fill('input[label="Minimum Order Quantity *"]', '1');
    await page.click('button:has-text("Next: Categorization")');
    await expect(page.locator('text=Categorization & Settings')).toBeVisible();
  });

  test('should handle cost price field correctly', async ({ page }) => {
    await page.click('button:has-text("Add Product")');
    
    // Verify cost price field is present
    await expect(page.locator('input[label="Cost Price"]')).toBeVisible();
    
    // Fill cost price
    await page.fill('input[label="Cost Price"]', '8.75');
    
    // Verify value is accepted
    await expect(page.locator('input[label="Cost Price"]')).toHaveValue('8.75');
    
    // Fill other required fields
    await page.fill('input[label="Product Title *"]', 'Cost Price Test');
    await page.fill('input[label="SKU *"]', 'CP-001');
    await page.fill('input[label="Main Price *"]', '15.99');
    
    // Should be able to proceed
    await page.click('button:has-text("Next: Categorization")');
    await expect(page.locator('text=Categorization & Settings')).toBeVisible();
  });

  test('should display correct step indicators', async ({ page }) => {
    await page.click('button:has-text("Add Product")');
    
    // Verify all 3 steps are shown in stepper
    await expect(page.locator('text=Basic Details')).toBeVisible();
    await expect(page.locator('text=Categorization & Settings')).toBeVisible();
    await expect(page.locator('text=Image Management')).toBeVisible();
    
    // Verify step 1 is active
    const step1 = page.locator('.MuiStep-root').first();
    await expect(step1).toHaveClass(/MuiStep-active/);
  });

  test('should handle image carousel in step 3', async ({ page }) => {
    // Create a product first (quick path)
    await page.click('button:has-text("Add Product")');
    
    // Fill minimal required fields
    await page.fill('input[label="Product Title *"]', 'Image Test Product');
    await page.fill('input[label="SKU *"]', 'IMG-001');
    await page.fill('input[label="Main Price *"]', '12.99');
    
    // Proceed through steps
    await page.click('button:has-text("Next: Categorization")');
    await page.click('button:has-text("Create Product & Continue")');
    
    // Wait for Step 3
    await page.waitForSelector('text=Image Management', { timeout: 10000 });
    
    // Verify image carousel components are present
    await expect(page.locator('text=Upload Images')).toBeVisible();
    await expect(page.locator('text=Drag to reorder')).toBeVisible();
    
    // Test multiple image upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([
      {
        name: 'image1.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-image-1')
      },
      {
        name: 'image2.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-image-2')
      }
    ]);
    
    // Complete workflow
    await page.click('button:has-text("Complete Product Creation")');
    await expect(page.locator('text=Product created successfully with all details!')).toBeVisible();
  });
});

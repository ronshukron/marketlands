# Database Structure

This document outlines the structure of our Firestore database collections and their fields.

## Collections Overview

1. [CommunityCoordinators](#communitycoordinators)
2. [Orders](#orders)
3. [Producers](#producers)
4. [Products](#products)
5. [Businesses](#businesses)
6. [Coordinators](#coordinators)
7. [Payments](#payments)
8. [PendingOrders](#pendingorders)
9. [Users](#users)

## Collection Details

### CommunityCoordinators
Collection path: `CommunityCoordinators`
Fields identified from code:
- Fields to be determined (not found in current code analysis)

### Orders
Collection path: `Orders`
Fields identified from code:
- `businessEmail` (string) - Email of the business that created the order
- `isArchived` (boolean) - Whether the order has been archived
- `archivedAt` (timestamp) - When the order was archived
- `orderName` / `Order_Name` (string) - Name of the order
- `businessName` (string) - Name of the business
- `Ending_Time` / `endingTime` (timestamp) - When the order closes
- `imageUrl` (string) - URL of the order's image

### Producers
Collection path: `Producers`
Fields identified from code:
- `Image` (string) - Producer's image URL
- `Kind` (string) - Type/category of producer
- `Location` (string) - Producer's location
- `Name` (string) - Producer's name
- `Product_*` (map) - Product entries with structure:
  - `Description` (string)
  - `Name` (string)
  - `Price` (number)
  - `Images` (array of strings)
  - `Options` (array of strings)

### Products
Collection path: `Products`
Fields identified from code:
- `name` (string) - Product name
- `price` (number) - Product price
- `description` (string) - Product description
- `options` (array of strings) - Product options/variants
- `images` (array of strings) - Array of image URLs
- `Owner_Email` (string) - Email of the product owner
- `Owner_ID` (string) - UID of the product owner
- `createdAt` (timestamp) - When the product was created

### Businesses
Collection path: `businesses`
Fields identified from code:
- `businessName` (string) - Name of the business
- `communityName` (string) - Associated community name
- `logo` (string) - Business logo URL
- `storeDescription` (string) - Description of the store
- `storeMoreInfo` (string) - Additional store information
- `phone` (string) - Business phone number
- `backgroundImageUrl` (string) - Store background image URL
- `profileImageUrl` (string) - Business profile image URL

### Coordinators
Collection path: `coordinators`
Fields identified from code:
- Fields to be determined (not found in current code analysis)

### Payments
Collection path: `payments`
Fields identified from code:
- Fields to be determined (not found in current code analysis)

### PendingOrders
Collection path: `pendingOrders`
Fields identified from code:
- Fields to be determined (not found in current code analysis)

### Users
Collection path: `users`
Fields identified from code:
- Fields to be determined (not found in current code analysis)

## Relationships and References

1. Products → Businesses: Products are owned by businesses (Owner_ID references business ID)
2. Orders → Businesses: Orders are created by businesses (businessEmail references business email)
3. Products → Orders: Orders contain references to products

## Notes
- Field names with multiple formats (e.g., `orderName` / `Order_Name`) indicate possible legacy data or schema evolution
- Timestamps are stored using Firestore Timestamp type
- Images are stored in Firebase Storage with URLs referenced in documents
- Some collections may have subcollections that will be documented as they are discovered
- Collections with "Fields to be determined" need further code analysis to identify their structure

---
*This documentation is auto-generated and maintained based on codebase analysis. Last updated: [Current Date]* 
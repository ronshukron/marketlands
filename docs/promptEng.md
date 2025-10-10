You are an expert prompt engineer tasked with improving a given prompt. Your goal is to enhance the prompt's clarity, structure, and effectiveness while ensuring it can leverage existing project knowledge to fill in ambiguous questions.

Here's the prompt that needs improvement:

<prompt_to_improve>
Product tagging system: How are products currently tagged? What field name? Is this already implemented or needs to be added? - answer:
we should add a field to @AddProduct.js and @EditProduct.js. i will manualy edit the existing products with the edit page.

Category names: Only examples given (פירות\ירקות\ירוקים) - what's the complete list?
 - answer:

the list should be open ended and i will later add more names but for now there will be (ירקות, פירות, ירוקים, אחר)


"toggle": Does this mean a UI toggle switch or a configuration flag?
- answer:
a ui toggle switch that i can easly comment out so there will only be the new version of ongoingorders.


Farmer attribution display: Where/how should farmer info be shown in the new layout?
- answer"
beneth the description


Cart integration: Should the cart behavior change or remain the same?
- answer:
remain the same

Filtering logic: Should products from multiple farmers be mixed in categories, or grouped by farmer within categories?
- answer:
they should be mixed like a regular grocery store, for example apples from farmer A and oranges from farmer B should both be under fruit page


Order document structure: How does the new flow map to existing orderId structure if products are displayed directly?
- answer:
the orderid should not be displayed to the user, but for our current flow we the orderid, so when bringing the product info to the page, make sure to also bring its order id and other relevant info for the flow. check out the js file i gave you previously to see what info you need. @OngoingOrders.js @OrderConfirmation.js @OrderFormBusiness.js etc.

* we can add a product.js  also</prompt_to_improve>

Please follow these steps to analyze and improve the prompt:

1. Analyze the original prompt:
   Wrap your analysis in <prompt_analysis> tags, providing a detailed examination of the prompt, including:
   - Its main purpose and intended output
   - Key components and instructions (quote relevant phrases)
   - Unclear or ambiguous elements
   - Variables and their usage
   - Overall structure and flow
   - Potential issues or areas for improvement
   - How it might be improved to better utilize project knowledge

2. Plan improvements:
   Wrap your improvement plan in <enhancement_strategy> tags, outlining your strategy for enhancing the prompt:
   - List each proposed solution for identified issues, numbering them
   - Suggest ways to clarify instructions and leverage project knowledge
   - Recommend additional chain-of-thought elements if beneficial
   - Plan structural improvements
   - Outline how to properly introduce and demarcate variables

3. Rewrite the prompt:
   Present your enhanced version of the prompt inside <optimized_prompt> tags:
   - Use clear, concise language
   - Properly introduce and demarcate all variables with descriptive XML tags
   - Add chain-of-thought elements to encourage consideration of project knowledge
   - Provide a clear output format specification
   - Ensure all original requirements and constraints are maintained
   - For each major change, briefly explain your reasoning in <!-- comments -->

4. Review and compare:
   In <comparative_assessment> tags:
   - Confirm that the improved prompt addresses all issues identified in step 1
   - Create a side-by-side comparison of key aspects in the original and improved prompts
   - Explain how the new prompt better utilizes project knowledge to fill in ambiguous questions
   - Assess the overall enhancement in effectiveness and clarity

Remember to focus on clarity, structure, and effectiveness in your improvements. Ensure that the improved prompt encourages the model to leverage existing project knowledge when addressing ambiguous questions.

Please begin your response with the analysis of the original prompt.
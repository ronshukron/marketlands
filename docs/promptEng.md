You are an expert prompt engineer tasked with improving a given prompt. Your goal is to enhance the prompt's clarity, structure, and effectiveness while ensuring it can leverage existing project knowledge to fill in ambiguous questions.

Here's the prompt that needs improvement:

<prompt_to_improve>
i want to work on enabling merchants to order from the farmers, as of now we have a flag in the user doc: isMerchant telling the system if a user is a merchant and if so it show him a different prices.

what we need to do:

in @IndependentFarmers.js when a merchant presses on the farmer listing we should take him to a new page that we need to create, i will be very similar.

instead of showing the merchant the community pickup spot we should ask him to pick a general location. like "השפלה" or "ירושלים".

we should add to @CreateIndependentOrderForm.js the farmer the ability to pick those general locations.

when the merchant adds a item to the cart it will go to the original global cart from the weekly sale, so that when he goes to order confirmation page he will meet the regular order flow, but in @OrderConfirmation.js we need to add a check if its a merchant, we need to also ask him for his address and also instead of pickup spot put a list with the general locations.

we need to add file that has all the places in israel and their general region, so when the merchant enters his address he need to choose from that list and if the place isnt in the regions that the farmer picked it will not be validated
</prompt_to_improve>

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
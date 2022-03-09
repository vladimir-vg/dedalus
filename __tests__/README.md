Need to think about proper test organization for Dedalus. Familiar in/out like tests are not applicable here, since expected result may come eventually, asynchronously.

If test fails, we would like to know why. Thus, it would be perfect if there would be a rule that ensures failure and captures values. We also would like to have several failure checks for same test file.

If at any tick any of the `test_failed` rules becomes true, test is immediately failed.

We also want to finish test as fast as possible. We need a rule that would finish test immediately as passed. If we have `test_failed` and `test_passed` true at the same time, then test considered to be failed.

Since having several clauses with different arity is not allowed, we consider all clauses that are prefixed with `test_passed` and `test_failed`.

```
test_passed(WhyPassed) <-
  find_solution(WhyPassed);

test_failed_for_first_reason(reason1) <-
  condition1,
  condition2;

test_failed_for_second_reason(OtherReason, AdditionalValue) <-
  condition3(OtherReason),
  condition4(OtherReason, AdditionalValue);
```

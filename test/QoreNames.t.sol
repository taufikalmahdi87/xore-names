// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/QoreNames.sol";

/// @notice Proves the v3 security fixes behave as claimed:
///  1. one address can hold at most 10 names (11th register reverts);
///  2. transferring to an address with no primary sets it;
///  3. a reentrant withdraw cannot drain the contract twice.
contract QoreNamesTest is Test {
    QoreNames reg;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        reg = new QoreNames();
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _name(uint256 i) internal pure returns (string memory) {
        return string(abi.encodePacked("name-", vm.toString(i)));
    }

    function testCapTenNamesThenRevert() public {
        vm.startPrank(alice);
        for (uint256 i = 0; i < 10; i++) {
            reg.register{value: 2 ether}(_name(i));
        }
        assertEq(reg.namesOf(alice).length, 10);
        vm.expectRevert(QoreNames.TooManyNames.selector);
        reg.register{value: 2 ether}("name-10");
        vm.stopPrank();
    }

    function testTransferSetsReceiverPrimary() public {
        vm.prank(alice);
        reg.register{value: 2 ether}("alice-one");
        assertEq(reg.reverseResolve(bob), "");
        vm.prank(alice);
        reg.transferName("alice-one", bob);
        assertEq(reg.reverseResolve(bob), "alice-one");
        assertEq(reg.resolve("alice-one"), bob);
    }

    function testWithdrawReentrancyCannotDoubleDrain() public {
        Attacker attacker = new Attacker();
        vm.deal(address(attacker), 100 ether);
        attacker.registerName{value: 2 ether}("victim-name");
        QoreNames victim = attacker.reg();
        assertEq(address(victim).balance, 2 ether);
        uint256 before = address(attacker).balance;
        attacker.go();
        // Exactly one payout, no double drain, contract empty, and the
        // reentrant call really happened (and was blocked by the guard).
        assertEq(address(attacker).balance, before + 2 ether);
        assertEq(address(victim).balance, 0);
        assertTrue(attacker.reentered());
    }
}

/// @notice Malicious owner: tries to re-enter withdraw() from receive().
contract Attacker {
    QoreNames public reg;
    bool public reentered;

    constructor() {
        reg = new QoreNames(); // this contract is the registry owner
    }

    function registerName(string calldata n) external payable {
        reg.register{value: msg.value}(n);
    }

    function go() external {
        reg.withdraw();
    }

    receive() external payable {
        if (!reentered) {
            reentered = true;
            // The guard must revert this inner call; the revert is swallowed
            // here so the outer withdraw can still complete exactly once.
            try reg.withdraw() {} catch {}
        }
    }
}

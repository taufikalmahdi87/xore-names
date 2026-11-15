// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title QoreNames — human-readable names for QoreChain (.qore)
/// @notice First-come-first-served name registry on the QoreChain Diana
/// testnet (EVM 9800). Names are permanent (no expiry, no renewal).
/// Pricing is by length, ENS-style: 3 chars = 10 QOR, 4 chars = 5 QOR,
/// 5+ chars = 2 QOR (test QOR only — faucet tokens, not real money).
/// Fees go to the owner and can be withdrawn with withdraw().
/// @dev Names are lowercase [a-z0-9-], 3-32 chars, no leading/trailing '-'.
/// Each address can own many names and picks one as its primary (reverse lookup).
/// Anti-squat: one address can hold at most MAX_NAMES_PER_ADDRESS names, so a
/// single faucet-funded account cannot drain the whole namespace, and the
/// per-owner name list stays short enough that transfer/release never run
/// out of gas looping over it.
contract QoreNames {
    event NameRegistered(string indexed name, address indexed owner, uint256 timestamp);
    event NameTransferred(string indexed name, address indexed from, address indexed to);
    event NameReleased(string indexed name, address indexed owner);
    event PrimarySet(address indexed owner, string name);

    /// @notice Price tiers in QOR (18 decimals): 3 chars / 4 chars / 5+ chars.
    uint256 public constant PRICE_3 = 10 ether;
    uint256 public constant PRICE_4 = 5 ether;
    uint256 public constant PRICE_5_PLUS = 2 ether;

    /// @notice Max names one address can hold (anti-squat cap, see above).
    uint256 public constant MAX_NAMES_PER_ADDRESS = 10;

    /// @notice Deployer — receives registration fees, can withdraw them.
    address public owner;

    /// @dev Reentrancy lock for withdraw() — the owner is an EOA today, but
    /// the guard costs nothing and stays correct if ownership ever moves.
    bool private _withdrawing;

    mapping(string => address) private _ownerOf;
    mapping(string => uint256) private _registeredAt;
    mapping(address => string[]) private _namesOf;
    mapping(address => string) private _primaryOf;

    error InvalidName();
    error NameTaken();
    error NotOwner();
    error NameNotFound();
    error NotRegistered();
    error TooManyNames();
    error Reentrancy();
    error WrongPrice(uint256 expected, uint256 paid);

    constructor() {
        owner = msg.sender;
    }

    /// @notice Price of a name by its length. Reverts on an invalid name.
    function priceFor(string calldata name) public pure returns (uint256) {
        if (!_valid(name)) revert InvalidName();
        uint256 len = bytes(name).length;
        if (len == 3) return PRICE_3;
        if (len == 4) return PRICE_4;
        return PRICE_5_PLUS;
    }

    /// @notice Register a name, paying its exact length-based price.
    /// Caller becomes its owner.
    function register(string calldata name) external payable {
        if (!_valid(name)) revert InvalidName();
        if (_ownerOf[name] != address(0)) revert NameTaken();
        if (_namesOf[msg.sender].length >= MAX_NAMES_PER_ADDRESS) revert TooManyNames();
        uint256 price = priceFor(name);
        if (msg.value != price) revert WrongPrice(price, msg.value);
        _ownerOf[name] = msg.sender;
        _registeredAt[name] = block.timestamp;
        _namesOf[msg.sender].push(name);
        if (bytes(_primaryOf[msg.sender]).length == 0) {
            _primaryOf[msg.sender] = name;
            emit PrimarySet(msg.sender, name);
        }
        emit NameRegistered(name, msg.sender, block.timestamp);
    }

    /// @notice Owner withdraws collected registration fees.
    function withdraw() external {
        if (msg.sender != owner) revert NotOwner();
        if (_withdrawing) revert Reentrancy();
        _withdrawing = true;
        (bool ok, ) = owner.call{value: address(this).balance}("");
        _withdrawing = false;
        require(ok, "withdraw failed");
    }

    /// @notice Forward lookup: name -> owner address (address(0) if free).
    function resolve(string calldata name) external view returns (address) {
        return _ownerOf[name];
    }

    /// @notice Reverse lookup: address -> its primary name ("" if none).
    function reverseResolve(address owner) external view returns (string memory) {
        return _primaryOf[owner];
    }

    /// @notice All names owned by an address.
    function namesOf(address owner) external view returns (string[] memory) {
        return _namesOf[owner];
    }

    /// @notice When a name was registered (0 if never).
    function registeredAt(string calldata name) external view returns (uint256) {
        return _registeredAt[name];
    }

    /// @notice Pick which of your names is your primary (reverse lookup).
    function setPrimary(string calldata name) external {
        if (_ownerOf[name] != msg.sender) revert NotOwner();
        _primaryOf[msg.sender] = name;
        emit PrimarySet(msg.sender, name);
    }

    /// @notice Transfer a name you own to another address.
    function transferName(string calldata name, address to) external {
        if (_ownerOf[name] != msg.sender) revert NotOwner();
        if (to == address(0)) revert InvalidName();
        _removeFromOwner(msg.sender, name);
        _ownerOf[name] = to;
        _namesOf[to].push(name);
        if (bytes(_primaryOf[to]).length == 0) {
            _primaryOf[to] = name;
            emit PrimarySet(to, name);
        }
        if (keccak256(bytes(_primaryOf[msg.sender])) == keccak256(bytes(name))) {
            _primaryOf[msg.sender] = _namesOf[msg.sender].length > 0
                ? _namesOf[msg.sender][0]
                : "";
        }
        emit NameTransferred(name, msg.sender, to);
    }

    /// @notice Free a name you own so anyone can register it.
    function releaseName(string calldata name) external {
        if (_ownerOf[name] != msg.sender) revert NotOwner();
        _removeFromOwner(msg.sender, name);
        delete _ownerOf[name];
        delete _registeredAt[name];
        if (keccak256(bytes(_primaryOf[msg.sender])) == keccak256(bytes(name))) {
            _primaryOf[msg.sender] = _namesOf[msg.sender].length > 0
                ? _namesOf[msg.sender][0]
                : "";
        }
        emit NameReleased(name, msg.sender);
    }

    function _removeFromOwner(address owner, string calldata name) private {
        string[] storage list = _namesOf[owner];
        for (uint256 i = 0; i < list.length; i++) {
            if (keccak256(bytes(list[i])) == keccak256(bytes(name))) {
                list[i] = list[list.length - 1];
                list.pop();
                return;
            }
        }
        revert NameNotFound();
    }

    function _valid(string calldata name) private pure returns (bool) {
        bytes calldata b = bytes(name);
        if (b.length < 3 || b.length > 32) return false;
        if (b[0] == bytes1("-") || b[b.length - 1] == bytes1("-")) return false;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= bytes1("a") && c <= bytes1("z"))
                || (c >= bytes1("0") && c <= bytes1("9"))
                || c == bytes1("-");
            if (!ok) return false;
        }
        return true;
    }
}

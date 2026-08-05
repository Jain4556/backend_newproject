import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
// import { useDeferredValue } from "react";

const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);

        console.log("User:", user);

        const accessToken = user.generateAccessToken();
        console.log("Access Token Generated");

        const refreshToken = user.generateRefreshToken();
        console.log("Refresh Token Generated");

        user.refreshToken = refreshToken;

        await user.save({ validateBeforeSave: false });
        console.log("Refresh Token Saved");

        return { accessToken, refreshToken };

    } catch (error) {
        console.log("REAL ERROR:", error);   // IMPORTANT
        throw new ApiError(
            500,
            "Something went wrong when generating refresh and access token"
        );
    }
};

const registerUser = asyncHandler(async (req, res) => {

    console.log("BODY:", req.body);
    console.log("FILES:", req.files);

    // Get user details from frontend
    const { fullName, email, username, password } = req.body;

    // Validation
    if (
        [fullName, email, username, password].some(
            (field) => !field || field.trim() === ""
        )
    ) {
        throw new ApiError(400, "All fields are required");
    }

    // Check if user already exists
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    });

    if (existedUser) {
        throw new ApiError(409, "User with this email or username already exists");
    }

    // Avatar (Required)
    const avatarLocalPath = req.files?.avatar?.[0]?.path;

    // Cover Image (Optional)
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required");
    }

    // Upload to Cloudinary
    const avatar = await uploadOnCloudinary(avatarLocalPath);

    const coverImage = coverImageLocalPath
        ? await uploadOnCloudinary(coverImageLocalPath)
        : null;

    if (!avatar) {
        throw new ApiError(400, "Error while uploading avatar");
    }

    // Create User
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase(),
    });

    // Remove password & refreshToken
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user");
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            createdUser,
            "User registered successfully"
        )
    );
});

const loginUser = asyncHandler(async (req, res) => {
    // Get data from request body
    const { username, email, password } = req.body;

    // Validate input
    if (!(username || email)) {
        throw new ApiError(400, "Username or Email is required");
    }

    if (!password) {
        throw new ApiError(400, "Password is required");
    }

    // Find user by username or email
    const user = await User.findOne({
        $or: [{ username }, { email }]
    });

    // Check if user exists
    if (!user) {
        throw new ApiError(404, "User does not exist");
    }

    console.log("Request Body:", req.body);
    console.log("Password:", password);
    console.log("User Password:", user.password);
    // Check password
    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }

    // Generate access and refresh tokens
    const { accessToken, refreshToken } =
        await generateAccessAndRefreshTokens(user._id);

    // Get logged-in user without password and refresh token
    const loggedInUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    // Cookie options
    const options = {
        httpOnly: true,
        secure: true
    };

    // Send response
    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    accessToken,
                    refreshToken
                },
                "User logged in successfully"
            )
        );
});

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true

    }

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(
            new ApiResponse(200, {}, "User logged out successfully")
        )

})

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Unauthrized request")
    }

   try {
     const decodedToken = jwt.verify(
         incomingRefreshToken,
         process.env.REFRESH_TOKEN_SECRET
     )
 
     const user = await User.findById(decodedToken?._id)
 
     if (!user) {
         throw new ApiError(401, "Invalid refresh token")
     }
 
     if (incomingRefreshToken !== user?.refreshToken) {
         throw new ApiError(401, "refresh token is expired or used")
     }
 
     const options = {
         httpOnly: true,
         secure: true
     }
 
     const { accessToken, newRefreshToken } = await generateAccessAndRefreshTokens(user._id)
 
     return res
         .status()
         .cookie("accessToken", accessToken)
         .cookie("accessToken", newRefreshToken, options)
         .json(
             new ApiResponse(
                 200,
                 { accessToken, refreshToken: newRefreshToken },
                 "Access token refreshed"
             )
         )
   } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token")
   }
})







export { registerUser, loginUser, logoutUser, refreshAccessToken };